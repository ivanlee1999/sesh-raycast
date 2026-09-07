import { encodeTaskRefs } from "./task-ref";
import type { SessionType, TimerState } from "./types";

/**
 * How far the running timer has left, right now.
 *
 * The server stores `remainingMs` as of `updatedAt` rather than a deadline —
 * that is what makes pause and resume exact — so the elapsed time since has to
 * be taken off here. Every operand is coerced defensively: SQLite hands some
 * values back as strings, which would otherwise turn the countdown into NaN.
 */
export function getEffectiveRemainingMs(
  timer: TimerState,
  now = Date.now(),
): number {
  return Math.max(0, getSignedRemainingMs(timer, now));
}

/**
 * The same figure, but allowed to go negative. A session that reaches zero
 * keeps counting up in sesh — running long is a normal thing to do — so the
 * sign is the only thing that says whether it is a countdown or overtime.
 */
export function getSignedRemainingMs(
  timer: TimerState,
  now = Date.now(),
): number {
  const remaining = Number(timer.remainingMs) || 0;
  if (timer.phase !== "running") return remaining;
  const updatedAt = Number(timer.updatedAt) || now;
  return remaining - (now - updatedAt);
}

/** Time run past the target, or 0 while the session is still inside it. */
export function getEffectiveOverflowMs(
  timer: TimerState,
  now = Date.now(),
): number {
  const signed = getSignedRemainingMs(timer, now);
  if (signed >= 0) return 0;
  return -signed;
}

export function isOverflowing(timer: TimerState, now = Date.now()): boolean {
  return timer.phase === "running" && getSignedRemainingMs(timer, now) < 0;
}

/** Everything the PUT handler needs but never changes on its own. */
function carryOver(timer: TimerState) {
  return {
    sessionType: timer.sessionType,
    intention: timer.intention ?? "",
    category: timer.category ?? "",
    targetMs: Number(timer.targetMs) || 0,
    startedAt: timer.startedAt,
    /*
     * Must be passed on every write. `PUT /api/timer` stores
     * `body.todoistTaskId ?? null`, so leaving it out unlinks the session from
     * the to-dos it was started against — and the minutes then land nowhere
     * when it finishes.
     */
    todoistTaskId: timer.todoistTaskId ?? null,
  };
}

export function buildPausePayload(
  timer: TimerState,
  now = Date.now(),
): Partial<TimerState> {
  return {
    ...carryOver(timer),
    phase: "paused",
    remainingMs: getEffectiveRemainingMs(timer, now),
    overflowMs: getEffectiveOverflowMs(timer, now),
    pausedAt: now,
  };
}

export function buildResumePayload(timer: TimerState): Partial<TimerState> {
  return {
    ...carryOver(timer),
    phase: "running",
    remainingMs: Number(timer.remainingMs) || 0,
    overflowMs: Number(timer.overflowMs) || 0,
    pausedAt: null,
  };
}

export interface StartOptions {
  sessionType: SessionType;
  durationMinutes: number;
  intention?: string;
  category?: string;
  /** Encoded task refs — see `./task-ref`. */
  taskRefs?: string[];
  now?: number;
}

export function buildStartPayload(opts: StartOptions): Partial<TimerState> {
  const now = opts.now ?? Date.now();
  const ms = Math.max(0, Math.round(opts.durationMinutes * 60_000));
  return {
    phase: "running",
    sessionType: opts.sessionType,
    intention: opts.intention ?? "",
    category: opts.category ?? "",
    targetMs: ms,
    remainingMs: ms,
    overflowMs: 0,
    startedAt: now,
    pausedAt: null,
    todoistTaskId: encodeTaskRefs(opts.taskRefs ?? []),
  };
}

/**
 * Park the topic on an idle timer.
 *
 * sesh-web keeps the intention, category and linked to-dos on the server even
 * before a session starts, so the next screen to open — the phone, the web app,
 * the menu bar — is already set up for the same thing. Setting an intention
 * from Raycast writes the same idle state rather than a private draft.
 */
export function buildIdlePayload(opts: {
  sessionType?: SessionType;
  intention?: string;
  category?: string;
  taskRefs?: string[];
  targetMs: number;
}): Partial<TimerState> {
  const target = Math.max(0, Math.round(opts.targetMs));
  return {
    phase: "idle",
    sessionType: opts.sessionType ?? "focus",
    intention: opts.intention ?? "",
    category: opts.category ?? "",
    targetMs: target,
    remainingMs: target,
    overflowMs: 0,
    startedAt: null,
    pausedAt: null,
    todoistTaskId: encodeTaskRefs(opts.taskRefs ?? []),
  };
}

/**
 * Abandon: hand the server back an empty idle timer without recording a
 * session. Distinct from finishing — it says the sitting did not happen, so
 * nothing is logged and no minutes are written to a to-do.
 */
export function buildAbandonPayload(targetMs: number): Partial<TimerState> {
  return buildIdlePayload({ targetMs });
}

/**
 * Rewrite what the running (or paused, or idle) timer is about, without moving
 * it.
 *
 * `PUT /api/timer` stamps `updatedAt` to now and stores `remainingMs` verbatim,
 * so a running session has to be handed its remaining time *as of now* — send
 * back the stored figure and the countdown jumps backwards by however long the
 * session has been going. The sign is kept rather than clamped, so a session
 * already in overtime stays in overtime.
 */
export function buildUpdatePayload(
  timer: TimerState,
  changes: {
    intention?: string;
    category?: string;
    /** Encoded refs. Omit to keep the current links; pass `[]` to clear them. */
    taskRefs?: string[];
    /** Lengthen (or, negative, shorten) the target and what is left of it. */
    addMinutes?: number;
  },
  now = Date.now(),
): Partial<TimerState> {
  const addMs = Math.round((changes.addMinutes ?? 0) * 60_000);
  const running = timer.phase === "running";
  const remaining =
    (running
      ? getSignedRemainingMs(timer, now)
      : Number(timer.remainingMs) || 0) + addMs;

  return {
    phase: timer.phase,
    sessionType: timer.sessionType,
    intention: changes.intention ?? timer.intention ?? "",
    category: changes.category ?? timer.category ?? "",
    targetMs: Math.max(0, (Number(timer.targetMs) || 0) + addMs),
    remainingMs: remaining,
    overflowMs: Math.max(0, -remaining),
    startedAt: timer.startedAt,
    pausedAt: timer.pausedAt,
    todoistTaskId: changes.taskRefs
      ? encodeTaskRefs(changes.taskRefs)
      : (timer.todoistTaskId ?? null),
  };
}
