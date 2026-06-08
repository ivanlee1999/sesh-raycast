import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("API helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockShowToast.mockClear();
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
    mockLocalStorage.removeItem.mockReset();
    mockLocalStorage.getItem.mockResolvedValue(undefined);
    mockLocalStorage.setItem.mockResolvedValue(undefined);
    mockLocalStorage.removeItem.mockResolvedValue(undefined);
    mockPreferences = {
      serverUrl: "http://localhost:3033/",
      defaultDuration: "25",
      authUsername: "ivan",
      authPassword: "secret",
    };
  });

  it("strips trailing slash from the base URL", async () => {
    const { getBaseUrl } = await loadApi();
    expect(getBaseUrl()).toBe("http://localhost:3033");
  });

  it("returns the parsed default duration", async () => {
    const { getDefaultDurationMinutes } = await loadApi();
    expect(getDefaultDurationMinutes()).toBe(25);
  });
});

describe("API request handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockShowToast.mockClear();
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
    mockLocalStorage.removeItem.mockReset();
    mockLocalStorage.getItem.mockResolvedValue(undefined);
    mockLocalStorage.setItem.mockResolvedValue(undefined);
    mockLocalStorage.removeItem.mockResolvedValue(undefined);
    mockPreferences = {
      serverUrl: "http://localhost:3033/",
      defaultDuration: "25",
      authUsername: "ivan",
      authPassword: "secret",
    };
  });

  it("handles 204 No Content without JSON parse error", async () => {
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

    const result = await completeSession({ startedAt: Date.now() });
    expect(result).toBeUndefined();
  });

  it("handles empty response body", async () => {
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

    const result = await getTimer();
    expect(result).toBeUndefined();
  });

  it("parses valid JSON response", async () => {
    const { getTimer } = await loadApi();
    const mockTimer = {
      phase: "idle",
      sessionType: "focus",
      remainingMs: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(mockTimer)),
      }),
    );

    const result = await getTimer();
    expect(result).toEqual(mockTimer);
  });

  it("throws on 4xx with error message and shows toast", async () => {
    const { getTimer } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
        text: () => Promise.resolve("resource not found"),
      }),
    );

    await expect(getTimer()).rejects.toThrow("Request failed: 404 Not Found");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "API Error",
      }),
    );
  });

  it("throws on 5xx with error message", async () => {
    const { getTimer } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
        text: () => Promise.resolve(""),
      }),
    );

    await expect(getTimer()).rejects.toThrow(
      "Request failed: 500 Internal Server Error",
    );
  });

  it("throws connection error when fetch rejects", async () => {
    const { getTimer } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    await expect(getTimer()).rejects.toThrow("Cannot connect to sesh server");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Connection Error",
      }),
    );
  });

  it("sends correct method and body for PUT", async () => {
    const { putTimer } = await loadApi();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ phase: "running" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    await putTimer({ phase: "running", targetMs: 1_500_000 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3033/api/timer",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ phase: "running", targetMs: 1_500_000 }),
      }),
    );
  });

  it("sends Content-Type: application/json header", async () => {
    const { getTimer } = await loadApi();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getTimer();

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("logs in on 401, stores the session cookie, and retries the request", async () => {
    const { getTimer } = await loadApi();
    const timerPayload = {
      phase: "running",
      sessionType: "focus",
      remainingMs: 1200000,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers(),
        text: () => Promise.resolve('{"error":"Authentication required"}'),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 303,
        statusText: "See Other",
        headers: new Headers({
          "set-cookie": "sesh_app_session=test-cookie; Path=/; HttpOnly; SameSite=Lax",
        }),
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(timerPayload)),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTimer();

    expect(result).toEqual(timerPayload);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3033/api/login",
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
        body: "username=ivan&password=secret&next=%2F",
      }),
    );
    const retryHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Headers;
    expect(retryHeaders.get("Cookie")).toBe("sesh_app_session=test-cookie");
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "sesh.app-session-cookie",
      "test-cookie",
    );
  });

  it("shows an auth error when credentials are missing for a protected server", async () => {
    mockPreferences = {
      ...mockPreferences,
      authUsername: "",
      authPassword: "",
    };
    const { getTimer } = await loadApi();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers(),
        text: () => Promise.resolve('{"error":"Authentication required"}'),
      }),
    );

    await expect(getTimer()).rejects.toThrow(
      "Set App Username and App Password in the sesh Raycast extension preferences.",
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Authentication Required",
      }),
    );
  });
});
