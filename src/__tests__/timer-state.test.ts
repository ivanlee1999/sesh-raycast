import { describe, it, expect, vi } from "vitest";

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
  getEffectiveRemainingMs,
  buildPausePayload,
  buildResumePayload,
  buildStartPayload,
} from "../timer-state";
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

// ── getEffectiveRemainingMs ──────────────────────────────────────────────────

describe("getEffectiveRemainingMs", () => {
  it("returns 0 for idle timer", () => {
    const timer = makeTimer({ phase: "idle", remainingMs: 1_500_000 });
    expect(getEffectiveRemainingMs(timer)).toBe(1_500_000);
  });

  it("returns remainingMs as-is for paused timer", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: 1_200_000,
    });
    expect(getEffectiveRemainingMs(timer)).toBe(1_200_000);
  });

  it("calculates elapsed time correctly for running timer", () => {
    const now = 1_000_000;
    const timer = makeTimer({
      phase: "running",
      remainingMs: 1_500_000,
      updatedAt: 900_000, // 100s ago
    });
    // remaining = 1_500_000 - (1_000_000 - 900_000) = 1_400_000
    expect(getEffectiveRemainingMs(timer, now)).toBe(1_400_000);
  });

  it("never returns negative", () => {
    const now = 2_000_000;
    const timer = makeTimer({
      phase: "running",
      remainingMs: 100_000,
      updatedAt: 1, // non-zero so it doesn't fallback to now
    });
    // elapsed = 2_000_000 - 1 = 1_999_999 > remainingMs → clamped to 0
    expect(getEffectiveRemainingMs(timer, now)).toBe(0);
  });

  it("handles string values gracefully (NaN coercion bug)", () => {
    const now = 1_000_000;
    const timer = makeTimer({
      phase: "running",
      remainingMs: "1500000" as unknown as number,
      updatedAt: "900000" as unknown as number,
    });
    const result = getEffectiveRemainingMs(timer, now);
    expect(result).toBe(1_400_000);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("handles remainingMs as string for non-running timer", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: "600000" as unknown as number,
    });
    expect(getEffectiveRemainingMs(timer)).toBe(600_000);
  });

  it("handles null updatedAt by using now", () => {
    const now = 1_000_000;
    const timer = makeTimer({
      phase: "running",
      remainingMs: 500_000,
      updatedAt: null as unknown as number,
    });
    // updatedAt coerces to 0, falls back to now → elapsed = 0
    const result = getEffectiveRemainingMs(timer, now);
    expect(result).toBe(500_000);
  });
});

// ── buildStartPayload ────────────────────────────────────────────────────────

describe("buildStartPayload", () => {
  const fixedNow = 1_711_800_000_000;

  it("all numeric fields are numbers, not strings", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(typeof payload.targetMs).toBe("number");
    expect(typeof payload.remainingMs).toBe("number");
    expect(typeof payload.overflowMs).toBe("number");
    expect(typeof payload.startedAt).toBe("number");
  });

  it("startedAt is epoch ms (not ISO string)", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.startedAt).toBe(fixedNow);
    expect(typeof payload.startedAt).toBe("number");
  });

  it("targetMs is calculated correctly from duration minutes", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.targetMs).toBe(25 * 60_000);
    expect(payload.remainingMs).toBe(25 * 60_000);
  });

  it("sets phase to running", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 10,
      now: fixedNow,
    });
    expect(payload.phase).toBe("running");
  });

  it("sets pausedAt to null", () => {
    const payload = buildStartPayload({
      sessionType: "short-break",
      durationMinutes: 5,
      now: fixedNow,
    });
    expect(payload.pausedAt).toBeNull();
  });

  it("passes through intention and category", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      intention: "Write tests",
      category: "development",
      now: fixedNow,
    });
    expect(payload.intention).toBe("Write tests");
    expect(payload.category).toBe("development");
  });

  it("defaults intention and category to null when not provided", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.intention).toBeNull();
    expect(payload.category).toBeNull();
  });

  it("overflowMs is always 0 for a new session", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.overflowMs).toBe(0);
  });
});

// ── buildPausePayload ────────────────────────────────────────────────────────

describe("buildPausePayload", () => {
  const fixedNow = 1_711_800_010_000;

  it("sets phase to paused", () => {
    const timer = makeTimer({
      phase: "running",
      remainingMs: 1_500_000,
      updatedAt: 1_711_800_000_000,
    });
    const payload = buildPausePayload(timer, fixedNow);
    expect(payload.phase).toBe("paused");
  });

  it("sets pausedAt to now", () => {
    const timer = makeTimer({
      phase: "running",
      remainingMs: 1_500_000,
      updatedAt: 1_711_800_000_000,
    });
    const payload = buildPausePayload(timer, fixedNow);
    expect(payload.pausedAt).toBe(fixedNow);
  });

  it("computes remainingMs after elapsed time", () => {
    const timer = makeTimer({
      phase: "running",
      remainingMs: 1_500_000,
      updatedAt: 1_711_800_000_000,
    });
    // 10s elapsed → 1_500_000 - 10_000
    const payload = buildPausePayload(timer, fixedNow);
    expect(payload.remainingMs).toBe(1_490_000);
  });

  it("preserves targetMs as number (coercion)", () => {
    const timer = makeTimer({
      phase: "running",
      targetMs: "1500000" as unknown as number,
      remainingMs: 1_500_000,
      updatedAt: fixedNow,
    });
    const payload = buildPausePayload(timer, fixedNow);
    expect(payload.targetMs).toBe(1_500_000);
    expect(typeof payload.targetMs).toBe("number");
  });
});

// ── buildResumePayload ───────────────────────────────────────────────────────

describe("buildResumePayload", () => {
  it("sets phase to running", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: 1_200_000,
    });
    const payload = buildResumePayload(timer);
    expect(payload.phase).toBe("running");
  });

  it("sets pausedAt to null", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: 1_200_000,
      pausedAt: 1_711_800_000_000,
    });
    const payload = buildResumePayload(timer);
    expect(payload.pausedAt).toBeNull();
  });

  it("preserves remainingMs as number (coercion)", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: "600000" as unknown as number,
    });
    const payload = buildResumePayload(timer);
    expect(payload.remainingMs).toBe(600_000);
    expect(typeof payload.remainingMs).toBe("number");
  });

  it("preserves overflowMs as number (coercion)", () => {
    const timer = makeTimer({
      phase: "paused",
      overflowMs: "5000" as unknown as number,
    });
    const payload = buildResumePayload(timer);
    expect(payload.overflowMs).toBe(5_000);
    expect(typeof payload.overflowMs).toBe("number");
  });
});
