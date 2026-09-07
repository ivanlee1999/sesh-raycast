import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShowToast = vi.fn();
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

let mockPreferences = {
  serverUrl: "http://localhost:3033/",
  defaultDuration: "25",
  authUsername: "ivan",
  authPassword: "secret",
};

vi.mock("@raycast/api", () => ({
  getPreferenceValues: () => mockPreferences,
  showToast: (...args: unknown[]) => mockShowToast(...args),
  showHUD: vi.fn(),
  Toast: { Style: { Failure: "failure", Success: "success" } },
  Icon: {},
  Color: {},
  LocalStorage: mockLocalStorage,
  closeMainWindow: vi.fn(),
  popToRoot: vi.fn(),
}));

vi.mock("@raycast/utils", () => ({
  usePromise: vi.fn(),
}));

async function loadApi() {
  return import("../api");
}

/** A plain JSON answer from sesh. */
function jsonResponse(
  body: unknown,
  init: { status?: number; statusText?: string } = {},
) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: new Headers({ "content-type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone: () => jsonResponse(body, init),
    json: () => Promise.resolve(body),
  };
}

function unauthorized() {
  return jsonResponse(
    { error: "Authentication required" },
    { status: 401, statusText: "Unauthorized" },
  );
}

/** The 303 `POST /api/login` answers with, carrying the app session cookie. */
function loginResponse(cookie = "test-cookie") {
  return {
    ok: false,
    status: 303,
    statusText: "See Other",
    headers: new Headers({
      "set-cookie": `sesh_app_session=${cookie}; Path=/; HttpOnly; SameSite=Lax`,
      location: "/",
    }),
    text: () => Promise.resolve(""),
    clone: () => loginResponse(cookie),
  };
}

/** The app shell, whose only job here is to hand back the task-proxy cookie. */
function shellResponse(cookie = "proxy-cookie") {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({
      "set-cookie": `todoist_proxy_auth=${cookie}; Path=/; HttpOnly; SameSite=Strict`,
    }),
    text: () => Promise.resolve("<html></html>"),
    clone: () => shellResponse(cookie),
  };
}

function resetMocks() {
  vi.resetModules();
  vi.restoreAllMocks();
  mockShowToast.mockClear();
  for (const fn of [
    mockLocalStorage.getItem,
    mockLocalStorage.setItem,
    mockLocalStorage.removeItem,
  ]) {
    fn.mockReset();
  }
  mockLocalStorage.getItem.mockResolvedValue(undefined);
  mockLocalStorage.setItem.mockResolvedValue(undefined);
  mockLocalStorage.removeItem.mockResolvedValue(undefined);
  mockPreferences = {
    serverUrl: "http://localhost:3033/",
    defaultDuration: "25",
    authUsername: "ivan",
    authPassword: "secret",
  };
}

describe("API helpers", () => {
  beforeEach(resetMocks);

  it("strips the trailing slash from the base URL", async () => {
    const { getBaseUrl } = await loadApi();
    expect(getBaseUrl()).toBe("http://localhost:3033");
  });

  it("parses the fallback duration preference", async () => {
    const { getDefaultDurationMinutes } = await loadApi();
    expect(getDefaultDurationMinutes()).toBe(25);
  });

  it("clamps a nonsense fallback duration", async () => {
    mockPreferences = { ...mockPreferences, defaultDuration: "nope" };
    const { getDefaultDurationMinutes } = await loadApi();
    expect(getDefaultDurationMinutes()).toBe(25);

    vi.resetModules();
    mockPreferences = { ...mockPreferences, defaultDuration: "9999" };
    const reloaded = await loadApi();
    expect(reloaded.getDefaultDurationMinutes()).toBe(180);
  });

  it("only offers to create to-dos where sesh can actually create them", async () => {
    const { canCreateTasks } = await loadApi();
    expect(canCreateTasks("things")).toBe(true);
    expect(canCreateTasks("todoist")).toBe(false);
  });
});

describe("API request handling", () => {
  beforeEach(resetMocks);

  it("returns undefined for 204 No Content rather than failing to parse it", async () => {
    const { completeSession } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        statusText: "No Content",
        headers: new Headers(),
        text: () => Promise.resolve(""),
      }),
    );
    await expect(
      completeSession({ startedAt: Date.now() }),
    ).resolves.toBeUndefined();
  });

  it("returns undefined for an empty body", async () => {
    const { getTimer } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        text: () => Promise.resolve(""),
      }),
    );
    await expect(getTimer()).resolves.toBeUndefined();
  });

  it("parses a JSON response", async () => {
    const { getTimer } = await loadApi();
    const payload = { phase: "idle", sessionType: "focus", remainingMs: 0 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));
    await expect(getTimer()).resolves.toEqual(payload);
  });

  it("puts the server's own message in the error, not a wall of HTML", async () => {
    const { getTimer } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "DB error" },
            { status: 500, statusText: "Internal Server Error" },
          ),
        ),
    );
    await expect(getTimer()).rejects.toThrow(
      "Request failed (500 Internal Server Error: DB error)",
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "API Error" }),
    );
  });

  it("drops a proxy's HTML error page instead of showing it", async () => {
    const { getTimer } = await loadApi();
    const html = {
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<html><body>Cloudflare</body></html>"),
      clone: () => html,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html));
    await expect(getTimer()).rejects.toThrow(
      "Request failed (502 Bad Gateway)",
    );
  });

  it("reports a connection error when the server cannot be reached", async () => {
    const { getTimer } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    await expect(getTimer()).rejects.toThrow("Cannot connect to sesh server");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Connection Error" }),
    );
  });

  it("sends the right method, body and content type for a write", async () => {
    const { putTimer } = await loadApi();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ phase: "running" }));
    vi.stubGlobal("fetch", fetchMock);

    await putTimer({ phase: "running", targetMs: 1_500_000 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3033/api/timer",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ phase: "running", targetMs: 1_500_000 }),
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});

describe("authentication", () => {
  beforeEach(resetMocks);

  /**
   * The task routes need a second cookie on top of the app session, and
   * sesh-web's middleware only issues it on a page request — which Raycast
   * never makes on its own. Signing in therefore has to be followed by asking
   * for the app shell, or every /api/things and /api/todoist call 401s forever.
   */
  it("signs in, collects both cookies, and retries the request", async () => {
    const { getTimer } = await loadApi();
    const payload = {
      phase: "running",
      sessionType: "focus",
      remainingMs: 1_200_000,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(shellResponse())
      .mockResolvedValueOnce(jsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTimer()).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3033/api/login",
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
        body: "username=ivan&password=secret&next=%2F",
      }),
    );
    // The shell request must look like a navigation, or no proxy cookie is issued.
    const shellHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Headers;
    expect(fetchMock.mock.calls[2]?.[0]).toBe("http://localhost:3033/");
    expect(shellHeaders.get("Accept")).toBe("text/html");

    const retryHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Headers;
    expect(retryHeaders.get("Cookie")).toBe(
      "sesh_app_session=test-cookie; todoist_proxy_auth=proxy-cookie",
    );

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "sesh.app-session-cookie",
      "test-cookie",
    );
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "sesh.proxy-cookie",
      "proxy-cookie",
    );
  });

  it("sends both stored cookies on the first attempt", async () => {
    mockLocalStorage.getItem.mockImplementation(async (key: string) =>
      key === "sesh.app-session-cookie" ? "stored-session" : "stored-proxy",
    );
    const { getCategories } = await loadApi();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await getCategories();

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Cookie")).toBe(
      "sesh_app_session=stored-session; todoist_proxy_auth=stored-proxy",
    );
  });

  it("still fetches the proxy cookie when the deployment has app auth switched off", async () => {
    mockPreferences = {
      ...mockPreferences,
      authUsername: "",
      authPassword: "",
    };
    const { getTimer } = await loadApi();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(shellResponse())
      .mockResolvedValueOnce(jsonResponse({ phase: "idle" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTimer()).resolves.toEqual({ phase: "idle" });
    // No credentials means no login round trip — straight to the shell.
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:3033/");
    const retryHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Headers;
    expect(retryHeaders.get("Cookie")).toBe("todoist_proxy_auth=proxy-cookie");
  });

  it("says the password is wrong when sesh bounces the login back to /login", async () => {
    const { getTimer } = await loadApi();
    const bounced = {
      ok: false,
      status: 303,
      statusText: "See Other",
      headers: new Headers({ location: "/login?next=%2F&error=1" }),
      text: () => Promise.resolve(""),
      clone: () => bounced,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(bounced),
    );

    await expect(getTimer()).rejects.toThrow(
      "Check the sesh Raycast App Username and App Password preferences",
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Authentication Required" }),
    );
  });

  it("asks for credentials when a protected server rejects an anonymous call", async () => {
    mockPreferences = {
      ...mockPreferences,
      authUsername: "",
      authPassword: "",
    };
    const { getTimer } = await loadApi();
    // No login, and the shell hands back nothing either — nothing to work with.
    const bare = {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: new Headers(),
      text: () => Promise.resolve(""),
      clone: () => bare,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bare));

    await expect(getTimer()).rejects.toThrow(
      "Set App Username and App Password",
    );
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
      "sesh.app-session-cookie",
    );
  });

  it("gives up rather than looping when a fresh sign-in is still rejected", async () => {
    const { getTimer } = await loadApi();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(shellResponse())
      .mockResolvedValueOnce(unauthorized());
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTimer()).rejects.toThrow("still rejected the request");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("tasks", () => {
  beforeEach(resetMocks);

  it("merges both providers and tags each task with where it came from", async () => {
    const { loadTasks } = await loadApi();
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/api/todoist/")
          ? jsonResponse({ tasks: [{ id: "1", content: "Todoist task" }] })
          : jsonResponse({
              tasks: [{ id: "abc", content: "Things task" }],
              syncing: true,
            }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadTasks("today", ["todoist", "things"]);

    expect(result.tasks).toEqual([
      expect.objectContaining({ id: "1", provider: "todoist" }),
      expect.objectContaining({ id: "abc", provider: "things" }),
    ]);
    expect(result.errors).toEqual([]);
    // A first connection has more history than one request can replay.
    expect(result.syncing).toBe(true);
  });

  /**
   * One provider being down must never hide the other — a Todoist outage should
   * not empty out a list of Things to-dos.
   */
  it("keeps the tasks that did load when one provider fails", async () => {
    const { loadTasks } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.includes("/api/todoist/")
            ? jsonResponse(
                { error: "Todoist not configured" },
                { status: 503, statusText: "Service Unavailable" },
              )
            : jsonResponse({
                tasks: [{ id: "abc", content: "Things task" }],
              }),
        ),
      ),
    );

    const result = await loadTasks("today", ["todoist", "things"]);

    expect(result.tasks).toHaveLength(1);
    expect(result.errors).toEqual([
      {
        provider: "todoist",
        message: expect.stringContaining("Todoist not configured"),
      },
    ]);
  });

  it("sends the viewer's day, since sesh-web normally runs in UTC", async () => {
    const { loadTasks } = await loadApi();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tasks: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await loadTasks("upcoming", ["things"]);

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /\/api\/things\/tasks\?filter=upcoming(&tz=.+)?$/,
    );
  });

  it("tells configured-but-unreachable apart from not configured", async () => {
    const { getProviderStatuses } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((url: string) =>
          Promise.resolve(
            url.includes("/api/todoist/")
              ? jsonResponse({ configured: false })
              : jsonResponse({ configured: true, reachable: false }),
          ),
        ),
    );

    const statuses = await getProviderStatuses(["todoist", "things"]);

    expect(statuses[0]).toMatchObject({
      provider: "todoist",
      state: "not_configured",
    });
    expect(statuses[1]).toMatchObject({ provider: "things", state: "error" });
  });

  it("refuses to create a to-do where sesh cannot", async () => {
    const { createTask } = await loadApi();
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      createTask("todoist", { title: "x", when: "today" }),
    ).rejects.toThrow("cannot be created from sesh");
  });

  it("rounds focused minutes up to at least one, as the routes require", async () => {
    const { recordFocusTime } = await loadApi();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await recordFocusTime("things", "ABC DEF", 0.2);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3033/api/things/tasks/ABC%20DEF/duration",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ add_minutes: 1 }),
    );
  });
});

describe("settings", () => {
  beforeEach(resetMocks);

  it("fills in the defaults for keys the server has never been asked about", async () => {
    const { getSettings } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ focusDuration: 50 })),
    );

    const settings = await getSettings();

    expect(settings.focusDuration).toBe(50);
    expect(settings.breakDuration).toBe(5);
    expect(settings.todoistEnabled).toBe(true);
  });
});
