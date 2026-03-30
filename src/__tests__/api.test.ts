import { describe, it, expect, vi, beforeEach } from "vitest";

const mockShowToast = vi.fn();

vi.mock("@raycast/api", () => ({
  getPreferenceValues: () => ({
    serverUrl: "http://localhost:3033/",
    defaultDuration: "25",
  }),
  showToast: (...args: unknown[]) => mockShowToast(...args),
  showHUD: vi.fn(),
  Toast: { Style: { Failure: "failure", Success: "success" } },
  Icon: {},
  Color: {},
  closeMainWindow: vi.fn(),
  popToRoot: vi.fn(),
}));

import {
  getBaseUrl,
  getDefaultDurationMinutes,
  getTimer,
  putTimer,
  completeSession,
} from "../api";

// ── getBaseUrl ───────────────────────────────────────────────────────────────

describe("getBaseUrl", () => {
  it("strips trailing slash", () => {
    // Preferences returns "http://localhost:3033/"
    expect(getBaseUrl()).toBe("http://localhost:3033");
  });
});

// ── getDefaultDurationMinutes ────────────────────────────────────────────────

describe("getDefaultDurationMinutes", () => {
  it("returns the parsed preference value", () => {
    expect(getDefaultDurationMinutes()).toBe(25);
  });
});

// ── request() via public API functions ───────────────────────────────────────

describe("API request handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowToast.mockClear();
  });

  it("handles 204 No Content without JSON parse error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(""),
      }),
    );

    const result = await completeSession({ startedAt: Date.now() });
    expect(result).toBeUndefined();
  });

  it("handles empty response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(""),
      }),
    );

    const result = await getTimer();
    expect(result).toBeUndefined();
  });

  it("parses valid JSON response", async () => {
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
        text: () => Promise.resolve(JSON.stringify(mockTimer)),
      }),
    );

    const result = await getTimer();
    expect(result).toEqual(mockTimer);
  });

  it("throws on 4xx with error message and shows toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve(""),
      }),
    );

    await expect(getTimer()).rejects.toThrow(
      "Request failed: 500 Internal Server Error",
    );
  });

  it("throws connection error when fetch rejects", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getTimer();

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]?.headers?.["Content-Type"]).toBe("application/json");
  });
});
