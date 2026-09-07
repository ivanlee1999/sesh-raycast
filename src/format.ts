import { getEffectiveOverflowMs, getSignedRemainingMs } from "./timer-state";
import type { TimerState } from "./types";

/**
 * Format milliseconds as a compact duration: "25m", "1h 5m", "0m".
 */
export function formatMinutes(ms: number): string {
  const safe = Number.isFinite(ms) ? ms : 0;
  const totalMin = Math.round(Math.max(0, safe) / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format milliseconds as a countdown: "18:32", "1:05:22".
 */
export function formatCountdown(ms: number): string {
  const safe = Number.isFinite(ms) ? ms : 0;
  const totalSec = Math.max(0, Math.floor(safe / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Timestamps arrive from sesh as epoch milliseconds; older rows and hand-built
 * fixtures use ISO strings. Both are accepted so a history row cannot render
 * as "Invalid Date".
 */
function toDate(input: number | string): Date {
  return new Date(
    typeof input === "string" && !/^\d+$/.test(input) ? input : Number(input),
  );
}

/** Local clock time: "2:30 PM". */
export function formatClockTime(input: number | string): string {
  return toDate(input).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Readable date: "Mon, Mar 30". */
export function formatDate(input: number | string): string {
  return toDate(input).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * What kind of session this is.
 *
 * sesh-web stores only `focus` and `break` — a long break is a break with a
 * longer target. The hyphenated names are what older versions of this
 * extension wrote, and still sit in the session history, so they are read.
 */
export function sessionTypeLabel(type: string): string {
  switch (type) {
    case "focus":
      return "Focus";
    case "break":
      return "Break";
    case "short-break":
      return "Short Break";
    case "long-break":
      return "Long Break";
    default:
      return type || "Session";
  }
}

/**
 * The state line: what the timer is doing, not just what it holds. A session
 * past its target reads as OVERTIME rather than a countdown stuck at zero.
 */
export function getPhaseLabel(timer: TimerState, now = Date.now()): string {
  if (timer.phase === "idle") return "IDLE";
  if (timer.phase === "paused") return "PAUSED";
  if (getSignedRemainingMs(timer, now) < 0) return "OVERTIME";
  return sessionTypeLabel(timer.sessionType).toUpperCase();
}

/**
 * The menu bar title. Overtime counts up behind a `+`, so a session left
 * running is visibly running long rather than sitting at 0:00.
 */
export function getMenuBarTitle(timer: TimerState, now = Date.now()): string {
  if (timer.phase === "idle") return "sesh";

  const signed = getSignedRemainingMs(timer, now);
  const icon =
    timer.phase === "paused" ? "⏸" : timer.sessionType === "focus" ? "⏱" : "☕";

  if (signed < 0)
    return `${icon} +${formatCountdown(getEffectiveOverflowMs(timer, now))}`;
  return `${icon} ${formatCountdown(signed)}`;
}

/** A star row for a session rating, or an em dash when it was never rated. */
export function formatRating(rating: number | undefined): string {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return value === 0 ? "—" : "★".repeat(value) + "☆".repeat(5 - value);
}
