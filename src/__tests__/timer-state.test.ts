import { describe, expect, it } from "vitest";

import {
  buildAbandonPayload,
  buildIdlePayload,
  buildPausePayload,
  buildResumePayload,
  buildStartPayload,
  buildUpdatePayload,
  getEffectiveOverflowMs,
  getEffectiveRemainingMs,
  getSignedRemainingMs,
  isOverflowing,
} from "../timer-state";
import type { TimerState } from "../types";

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
  it("returns the stored value for an idle timer", () => {
    expect(
      getEffectiveRemainingMs(
        makeTimer({ phase: "idle", remainingMs: 1_500_000 }),
      ),
    ).toBe(1_500_000);
  });

  it("returns the stored value for a paused timer", () => {
    expect(
      getEffectiveRemainingMs(
        makeTimer({ phase: "paused", remainingMs: 1_200_000 }),
      ),
    ).toBe(1_200_000);
  });

  it("subtracts the time elapsed since updatedAt while running", () => {
    const timer = makeTimer({
      phase: "running",
      remainingMs: 1_500_000,
      updatedAt: 900_000,
    });
    expect(getEffectiveRemainingMs(timer, 1_000_000)).toBe(1_400_000);
  });

  it("never returns negative", () => {
    const timer = makeTimer({
      phase: "running",
      remainingMs: 100_000,
      updatedAt: 1,
    });
    expect(getEffectiveRemainingMs(timer, 2_000_000)).toBe(0);
  });

  it("coerces string values from SQLite rather than producing NaN", () => {
    const timer = makeTimer({
      phase: "running",
      remainingMs: "1500000" as unknown as number,
      updatedAt: "900000" as unknown as number,
    });
    const result = getEffectiveRemainingMs(timer, 1_000_000);
    expect(result).toBe(1_400_000);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("falls back to now when updatedAt is missing", () => {
    const timer = makeTimer({
      phase: "running",
      remainingMs: 500_000,
      updatedAt: null as unknown as number,
    });
    expect(getEffectiveRemainingMs(timer, 1_000_000)).toBe(500_000);
  });
});

// ── overtime ─────────────────────────────────────────────────────────────────

describe("overtime", () => {
  const overdue = makeTimer({
    phase: "running",
    targetMs: 60_000,
    remainingMs: 10_000,
    updatedAt: 1_000_000,
  });

  it("keeps the sign so a session past target reads as overtime", () => {
    expect(getSignedRemainingMs(overdue, 1_100_000)).toBe(-90_000);
  });

  it("reports how far past target the session has run", () => {
    expect(getEffectiveOverflowMs(overdue, 1_100_000)).toBe(90_000);
    expect(isOverflowing(overdue, 1_100_000)).toBe(true);
  });

  it("reports no overtime while the session is still inside its target", () => {
    expect(getEffectiveOverflowMs(overdue, 1_005_000)).toBe(0);
    expect(isOverflowing(overdue, 1_005_000)).toBe(false);
  });

  it("does not call a paused timer overdue", () => {
    const paused = makeTimer({ phase: "paused", remainingMs: -5_000 });
    expect(isOverflowing(paused)).toBe(false);
  });
});

// ── buildStartPayload ────────────────────────────────────────────────────────

describe("buildStartPayload", () => {
  const fixedNow = 1_711_800_000_000;

  it("sends numbers, not strings", () => {
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

  it("sends startedAt as epoch ms, not an ISO string", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.startedAt).toBe(fixedNow);
  });

  it("converts minutes to a target and a full remaining", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.targetMs).toBe(25 * 60_000);
    expect(payload.remainingMs).toBe(25 * 60_000);
    expect(payload.overflowMs).toBe(0);
  });

  it("starts running and unpaused", () => {
    const payload = buildStartPayload({
      sessionType: "break",
      durationMinutes: 5,
      now: fixedNow,
    });
    expect(payload.phase).toBe("running");
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

  it("defaults intention and category to the empty string the server stores", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.intention).toBe("");
    expect(payload.category).toBe("");
  });

  it("encodes linked to-dos the way sesh-web stores them", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      taskRefs: ["12345", "things:ABC-DEF"],
      now: fixedNow,
    });
    expect(payload.todoistTaskId).toBe("12345,things:ABC-DEF");
  });

  it("sends null rather than an empty string when nothing is linked", () => {
    const payload = buildStartPayload({
      sessionType: "focus",
      durationMinutes: 25,
      now: fixedNow,
    });
    expect(payload.todoistTaskId).toBeNull();
  });
});

// ── buildPausePayload ────────────────────────────────────────────────────────

describe("buildPausePayload", () => {
  const fixedNow = 1_711_800_010_000;
  const running = makeTimer({
    phase: "running",
    remainingMs: 1_500_000,
    updatedAt: 1_711_800_000_000,
  });

  it("pauses at now with the time actually left", () => {
    const payload = buildPausePayload(running, fixedNow);
    expect(payload.phase).toBe("paused");
    expect(payload.pausedAt).toBe(fixedNow);
    expect(payload.remainingMs).toBe(1_490_000);
  });

  it("coerces targetMs to a number", () => {
    const timer = makeTimer({
      phase: "running",
      targetMs: "1500000" as unknown as number,
      updatedAt: fixedNow,
    });
    const payload = buildPausePayload(timer, fixedNow);
    expect(payload.targetMs).toBe(1_500_000);
  });

  it("keeps the linked to-dos — PUT stores todoistTaskId ?? null, so dropping it unlinks the session", () => {
    const timer = makeTimer({ ...running, todoistTaskId: "things:ABC" });
    expect(buildPausePayload(timer, fixedNow).todoistTaskId).toBe("things:ABC");
  });

  it("records how far past target an overdue session was paused", () => {
    const overdue = makeTimer({
      phase: "running",
      remainingMs: 1_000,
      updatedAt: 1_711_800_000_000,
    });
    const payload = buildPausePayload(overdue, fixedNow);
    expect(payload.remainingMs).toBe(0);
    expect(payload.overflowMs).toBe(9_000);
  });
});

// ── buildResumePayload ───────────────────────────────────────────────────────

describe("buildResumePayload", () => {
  it("resumes running and unpaused", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: 1_200_000,
      pausedAt: 1_711_800_000_000,
    });
    const payload = buildResumePayload(timer);
    expect(payload.phase).toBe("running");
    expect(payload.pausedAt).toBeNull();
  });

  it("coerces remainingMs and overflowMs to numbers", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: "600000" as unknown as number,
      overflowMs: "5000" as unknown as number,
    });
    const payload = buildResumePayload(timer);
    expect(payload.remainingMs).toBe(600_000);
    expect(payload.overflowMs).toBe(5_000);
  });

  it("keeps the linked to-dos", () => {
    const timer = makeTimer({
      phase: "paused",
      remainingMs: 60_000,
      todoistTaskId: "12345",
    });
    expect(buildResumePayload(timer).todoistTaskId).toBe("12345");
  });
});

// ── buildIdlePayload / buildAbandonPayload ───────────────────────────────────

describe("buildIdlePayload", () => {
  it("parks a topic on the server without starting a clock", () => {
    const payload = buildIdlePayload({
      intention: "Read the spec",
      category: "learning",
      taskRefs: ["things:ABC"],
      targetMs: 25 * 60_000,
    });
    expect(payload.phase).toBe("idle");
    expect(payload.startedAt).toBeNull();
    expect(payload.remainingMs).toBe(25 * 60_000);
    expect(payload.todoistTaskId).toBe("things:ABC");
  });

  it("abandoning clears the topic and the links", () => {
    const payload = buildAbandonPayload(25 * 60_000);
    expect(payload.phase).toBe("idle");
    expect(payload.intention).toBe("");
    expect(payload.todoistTaskId).toBeNull();
  });
});

// ── buildUpdatePayload ───────────────────────────────────────────────────────

describe("buildUpdatePayload", () => {
  const running = makeTimer({
    phase: "running",
    intention: "Old title",
    category: "development",
    targetMs: 1_500_000,
    remainingMs: 1_500_000,
    updatedAt: 1_711_800_000_000,
    todoistTaskId: "12345",
  });

  it("re-titles without moving the clock — PUT restamps updatedAt, so remaining must be as of now", () => {
    const payload = buildUpdatePayload(
      running,
      { intention: "New title" },
      1_711_800_060_000,
    );
    expect(payload.intention).toBe("New title");
    expect(payload.remainingMs).toBe(1_440_000);
    expect(payload.targetMs).toBe(1_500_000);
  });

  it("keeps the linked to-dos when none are named", () => {
    expect(
      buildUpdatePayload(running, { intention: "New" }, 1_711_800_000_000)
        .todoistTaskId,
    ).toBe("12345");
  });

  it("clears the links when an empty list is named", () => {
    expect(
      buildUpdatePayload(running, { taskRefs: [] }, 1_711_800_000_000)
        .todoistTaskId,
    ).toBeNull();
  });

  it("extends both the target and what is left of it", () => {
    const payload = buildUpdatePayload(
      running,
      { addMinutes: 10 },
      1_711_800_000_000,
    );
    expect(payload.targetMs).toBe(2_100_000);
    expect(payload.remainingMs).toBe(2_100_000);
  });

  it("extending an overdue session brings it back inside its target", () => {
    const overdue = makeTimer({
      ...running,
      remainingMs: -60_000,
      updatedAt: 1_711_800_000_000,
    });
    const payload = buildUpdatePayload(
      overdue,
      { addMinutes: 5 },
      1_711_800_000_000,
    );
    expect(payload.remainingMs).toBe(240_000);
    expect(payload.overflowMs).toBe(0);
  });

  it("reads a paused timer's remaining straight off the row", () => {
    const paused = makeTimer({
      ...running,
      phase: "paused",
      remainingMs: 600_000,
    });
    expect(
      buildUpdatePayload(paused, { intention: "New" }, 1_711_900_000_000)
        .remainingMs,
    ).toBe(600_000);
  });
});
