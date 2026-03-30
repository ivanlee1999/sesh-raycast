import type { TimerState } from "./types";

/**
 * Calculate the effective remaining milliseconds right now.
 * When the timer is running, we subtract the elapsed time since `updatedAt`.
 * When paused or idle, we return `remainingMs` as-is.
 *
 * All operands are coerced to Number() defensively — the server may return
 * string values from SQLite, which would otherwise produce NaN.
 */
export function getEffectiveRemainingMs(
  timer: TimerState,
  now = Date.now(),
): number {
  const remaining = Number(timer.remainingMs) || 0;
  if (timer.phase !== "running") return remaining;
  const updatedAt = Number(timer.updatedAt) || now;
  const elapsed = now - updatedAt;
  return Math.max(0, remaining - elapsed);
}

/**
 * Build the payload to pause a running timer.
 */
export function buildPausePayload(
  timer: TimerState,
  now = Date.now(),
): Partial<TimerState> {
  const remaining = getEffectiveRemainingMs(timer, now);
  return {
    phase: "paused",
    sessionType: timer.sessionType,
    intention: timer.intention,
    category: timer.category,
    targetMs: Number(timer.targetMs) || 0,
    remainingMs: remaining,
    overflowMs: Number(timer.overflowMs) || 0,
    startedAt: timer.startedAt,
    pausedAt: now,
  };
}

/**
 * Build the payload to resume a paused timer.
 */
export function buildResumePayload(timer: TimerState): Partial<TimerState> {
  return {
    phase: "running",
    sessionType: timer.sessionType,
    intention: timer.intention,
    category: timer.category,
    targetMs: Number(timer.targetMs) || 0,
    remainingMs: Number(timer.remainingMs) || 0,
    overflowMs: Number(timer.overflowMs) || 0,
    startedAt: timer.startedAt,
    pausedAt: null,
  };
}

/**
 * Build the payload to start a new timer session.
 */
export function buildStartPayload(opts: {
  sessionType: "focus" | "short-break" | "long-break";
  durationMinutes: number;
  intention?: string;
  category?: string;
  now?: number;
}): Partial<TimerState> {
  const now = opts.now ?? Date.now();
  const ms = opts.durationMinutes * 60_000;
  return {
    phase: "running",
    sessionType: opts.sessionType,
    intention: opts.intention || null,
    category: opts.category || null,
    targetMs: ms,
    remainingMs: ms,
    overflowMs: 0,
    startedAt: now,
    pausedAt: null,
  };
}
