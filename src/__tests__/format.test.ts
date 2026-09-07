import { describe, expect, it, vi } from "vitest";

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
  formatRating,
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

// ── formatClockTime / formatDate ────────────────────────────────────────────

/**
 * sesh returns epoch milliseconds. Older rows and hand-built fixtures use ISO
 * strings, and both have to render — a history row showing "Invalid Date" was
 * the whole reason these accept either.
 */
describe("formatClockTime", () => {
  it("renders epoch milliseconds", () => {
    const result = formatClockTime(Date.UTC(2026, 2, 30, 14, 30));
    expect(result).toMatch(/\d/);
  });

  it("renders an ISO timestamp", () => {
    expect(formatClockTime("2026-03-30T14:30:00Z")).toMatch(/\d/);
  });

  it("agrees between the two for the same instant", () => {
    const ms = Date.UTC(2026, 2, 30, 14, 30);
    expect(formatClockTime(ms)).toBe(
      formatClockTime(new Date(ms).toISOString()),
    );
  });
});

describe("formatDate", () => {
  it("renders epoch milliseconds", () => {
    expect(formatDate(Date.UTC(2026, 2, 30))).toMatch(/\d/);
  });

  it("renders an ISO date", () => {
    expect(formatDate("2026-03-30T00:00:00Z")).toMatch(/\d/);
  });
});

// ── getPhaseLabel ────────────────────────────────────────────────────────────

describe("getPhaseLabel", () => {
  it("returns 'IDLE' for an idle timer", () => {
    expect(getPhaseLabel(makeTimer({ phase: "idle" }))).toBe("IDLE");
  });

  it("returns 'PAUSED' for a paused timer", () => {
    expect(getPhaseLabel(makeTimer({ phase: "paused" }))).toBe("PAUSED");
  });

  it("returns 'FOCUS' for a running focus session", () => {
    const timer = makeTimer({
      phase: "running",
      sessionType: "focus",
      remainingMs: 600_000,
      updatedAt: 1_000,
    });
    expect(getPhaseLabel(timer, 1_000)).toBe("FOCUS");
  });

  it("returns 'BREAK' for a running break", () => {
    const timer = makeTimer({
      phase: "running",
      sessionType: "break",
      remainingMs: 300_000,
      updatedAt: 1_000,
    });
    expect(getPhaseLabel(timer, 1_000)).toBe("BREAK");
  });

  it("returns 'OVERTIME' once a session runs past its target", () => {
    const timer = makeTimer({
      phase: "running",
      sessionType: "focus",
      remainingMs: 1_000,
      updatedAt: 1_000,
    });
    expect(getPhaseLabel(timer, 61_000)).toBe("OVERTIME");
  });

  it("still reads the hyphenated types older versions of this extension wrote", () => {
    const timer = makeTimer({
      phase: "running",
      sessionType: "long-break",
      remainingMs: 900_000,
      updatedAt: 1_000,
    });
    expect(getPhaseLabel(timer, 1_000)).toBe("LONG BREAK");
  });
});

// ── getMenuBarTitle ──────────────────────────────────────────────────────────

describe("getMenuBarTitle", () => {
  it("returns 'sesh' for an idle timer", () => {
    expect(getMenuBarTitle(makeTimer({ phase: "idle" }))).toBe("sesh");
  });

  it("shows a pause icon and the frozen countdown when paused", () => {
    const timer = makeTimer({ phase: "paused", remainingMs: 90_000 });
    expect(getMenuBarTitle(timer)).toBe("⏸ 1:30");
  });

  it("counts down from the time actually left in a running focus session", () => {
    const timer = makeTimer({
      phase: "running",
      sessionType: "focus",
      remainingMs: 90_000,
      updatedAt: 1_000,
    });
    expect(getMenuBarTitle(timer, 31_000)).toBe("⏱ 1:00");
  });

  it("shows a coffee cup for a break", () => {
    const timer = makeTimer({
      phase: "running",
      sessionType: "break",
      remainingMs: 300_000,
      updatedAt: 1_000,
    });
    expect(getMenuBarTitle(timer, 1_000)).toBe("☕ 5:00");
  });

  it("counts up behind a plus once the session is over its target", () => {
    const timer = makeTimer({
      phase: "running",
      sessionType: "focus",
      remainingMs: 10_000,
      updatedAt: 1_000,
    });
    expect(getMenuBarTitle(timer, 101_000)).toBe("⏱ +1:30");
  });
});

// ── sessionTypeLabel ─────────────────────────────────────────────────────────

describe("sessionTypeLabel", () => {
  it("names the two types the server actually stores", () => {
    expect(sessionTypeLabel("focus")).toBe("Focus");
    expect(sessionTypeLabel("break")).toBe("Break");
  });

  it("still names the hyphenated types sitting in older session rows", () => {
    expect(sessionTypeLabel("short-break")).toBe("Short Break");
    expect(sessionTypeLabel("long-break")).toBe("Long Break");
  });

  it("passes an unknown type through", () => {
    expect(sessionTypeLabel("meditation")).toBe("meditation");
  });
});

// ── formatRating ─────────────────────────────────────────────────────────────

describe("formatRating", () => {
  it("draws an unrated session as an em dash", () => {
    expect(formatRating(0)).toBe("—");
    expect(formatRating(undefined)).toBe("—");
  });

  it("draws a rating out of five", () => {
    expect(formatRating(3)).toBe("★★★☆☆");
    expect(formatRating(5)).toBe("★★★★★");
  });

  it("clamps a rating the server would have clamped anyway", () => {
    expect(formatRating(9)).toBe("★★★★★");
    expect(formatRating(-2)).toBe("—");
  });
});
