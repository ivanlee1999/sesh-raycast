import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@raycast/api", () => ({
  getPreferenceValues: () => ({
    serverUrl: "http://localhost:3033",
    defaultDuration: "25",
  }),
  showToast: vi.fn(),
  showHUD: vi.fn(),
  Toast: { Style: { Failure: "failure", Success: "success" } },
  Icon: {},
  Color: {},
  closeMainWindow: vi.fn(),
  popToRoot: vi.fn(),
}));

import {
  formatMinutes,
  formatCountdown,
  formatClockTime,
  formatDate,
  getPhaseLabel,
  getMenuBarTitle,
  sessionTypeLabel,
} from "../format";
import type { TimerState } from "../types";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTimer(overrides: Partial<TimerState> = {}): TimerState {
  return {
    phase: "idle",
    sessionType: "focus",
    intention: "",
    category: "",
    targetMs: 0,
    remainingMs: 0,
    overflowMs: 0,
    startedAt: null,
    pausedAt: null,
    updatedAt: 0,
    todoistTaskId: null,
    ...overrides,
  };
}

// ── formatMinutes ────────────────────────────────────────────────────────────

describe("formatMinutes", () => {
  it("formats 0 ms as '0m'", () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  it("formats 60 000 ms as '1m'", () => {
    expect(formatMinutes(60_000)).toBe("1m");
  });

  it("formats 1 500 000 ms (25 min) as '25m'", () => {
    expect(formatMinutes(1_500_000)).toBe("25m");
  });

  it("formats 3 600 000 ms (1 h) as '1h'", () => {
    expect(formatMinutes(3_600_000)).toBe("1h");
  });

  it("formats 5 400 000 ms (1h 30m) as '1h 30m'", () => {
    expect(formatMinutes(5_400_000)).toBe("1h 30m");
  });

  it("formats 3 900 000 ms (1h 5m) as '1h 5m'", () => {
    expect(formatMinutes(3_900_000)).toBe("1h 5m");
  });

  it("handles NaN gracefully → '0m'", () => {
    expect(formatMinutes(NaN)).toBe("0m");
  });

  it("handles undefined gracefully → '0m'", () => {
    expect(formatMinutes(undefined as unknown as number)).toBe("0m");
  });

  it("handles null gracefully → '0m'", () => {
    expect(formatMinutes(null as unknown as number)).toBe("0m");
  });

  it("handles negative values → '0m'", () => {
    expect(formatMinutes(-60_000)).toBe("0m");
  });

  it("handles Infinity → '0m'", () => {
    expect(formatMinutes(Infinity)).toBe("0m");
  });
});

// ── formatCountdown ──────────────────────────────────────────────────────────

describe("formatCountdown", () => {
  it("formats 0 ms as '0:00'", () => {
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("formats 90 000 ms (1m30s) as '1:30'", () => {
    expect(formatCountdown(90_000)).toBe("1:30");
  });

  it("formats 1 500 000 ms (25m) as '25:00'", () => {
    expect(formatCountdown(1_500_000)).toBe("25:00");
  });

  it("formats 3 661 000 ms (1h 1m 1s) as '1:01:01'", () => {
    expect(formatCountdown(3_661_000)).toBe("1:01:01");
  });

  it("formats 3 600 000 ms (exactly 1h) as '1:00:00'", () => {
    expect(formatCountdown(3_600_000)).toBe("1:00:00");
  });

  it("handles NaN gracefully → '0:00'", () => {
    expect(formatCountdown(NaN)).toBe("0:00");
  });

  it("handles negative values → '0:00'", () => {
    expect(formatCountdown(-5000)).toBe("0:00");
  });
});

// ── formatClockTime ──────────────────────────────────────────────────────────

describe("formatClockTime", () => {
  it("returns a non-empty string for a valid ISO timestamp", () => {
    const result = formatClockTime("2026-03-30T14:30:00Z");
    expect(result).toBeTruthy();
    // Locale-dependent, so just check it contains digits
    expect(result).toMatch(/\d/);
  });
});

// ── formatDate ───────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatDate("2026-03-30T00:00:00Z");
    expect(result).toBeTruthy();
    expect(result).toMatch(/\d/);
  });
});

// ── getPhaseLabel ────────────────────────────────────────────────────────────

describe("getPhaseLabel", () => {
  it("returns 'IDLE' for idle phase", () => {
    expect(getPhaseLabel(makeTimer({ phase: "idle" }))).toBe("IDLE");
  });

  it("returns 'PAUSED' for paused phase", () => {
    expect(getPhaseLabel(makeTimer({ phase: "paused" }))).toBe("PAUSED");
  });

  it("returns 'FOCUS' for running focus session", () => {
    expect(
      getPhaseLabel(makeTimer({ phase: "running", sessionType: "focus" })),
    ).toBe("FOCUS");
  });

  it("returns 'SHORT BREAK' for running short-break", () => {
    expect(
      getPhaseLabel(
        makeTimer({ phase: "running", sessionType: "short-break" }),
      ),
    ).toBe("SHORT BREAK");
  });

  it("returns 'LONG BREAK' for running long-break", () => {
    expect(
      getPhaseLabel(
        makeTimer({ phase: "running", sessionType: "long-break" }),
      ),
    ).toBe("LONG BREAK");
  });

  it("returns 'RUNNING' for unknown session type", () => {
    expect(
      getPhaseLabel(makeTimer({ phase: "running", sessionType: "unknown" })),
    ).toBe("RUNNING");
  });
});

// ── getMenuBarTitle ──────────────────────────────────────────────────────────

describe("getMenuBarTitle", () => {
  it("returns 'sesh' for idle timer", () => {
    expect(getMenuBarTitle(makeTimer({ phase: "idle" }), 0)).toBe("sesh");
  });

  it("returns paused icon with countdown for paused timer", () => {
    const result = getMenuBarTitle(makeTimer({ phase: "paused" }), 1_500_000);
    expect(result).toBe("⏸ 25:00");
  });

  it("returns timer icon with countdown for running focus", () => {
    const result = getMenuBarTitle(
      makeTimer({ phase: "running", sessionType: "focus" }),
      1_500_000,
    );
    expect(result).toBe("⏱ 25:00");
  });

  it("returns coffee icon for running break", () => {
    const result = getMenuBarTitle(
      makeTimer({ phase: "running", sessionType: "short-break" }),
      300_000,
    );
    expect(result).toBe("☕ 5:00");
  });
});

// ── sessionTypeLabel ─────────────────────────────────────────────────────────

describe("sessionTypeLabel", () => {
  it("returns 'Focus' for 'focus'", () => {
    expect(sessionTypeLabel("focus")).toBe("Focus");
  });

  it("returns 'Short Break' for 'short-break'", () => {
    expect(sessionTypeLabel("short-break")).toBe("Short Break");
  });

  it("returns 'Long Break' for 'long-break'", () => {
    expect(sessionTypeLabel("long-break")).toBe("Long Break");
  });

  it("returns the raw value for unknown types", () => {
    expect(sessionTypeLabel("custom")).toBe("custom");
  });
});
