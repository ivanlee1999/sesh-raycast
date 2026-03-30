import type { TimerState } from "./types";

/**
 * Format milliseconds as compact duration string: "25m", "1h 5m", "0m"
 */
export function formatMinutes(ms: number): string {
  const totalMin = Math.round(Math.max(0, ms) / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format milliseconds as countdown string: "18:32", "1:05:22"
 */
export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Format ISO timestamp as local clock time: "2:30 PM"
 */
export function formatClockTime(input: string): string {
  const d = new Date(input);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format ISO date string as readable date: "Mon, Mar 30"
 */
export function formatDate(input: string): string {
  const d = new Date(input);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Get phase label for display.
 */
export function getPhaseLabel(timer: TimerState): string {
  if (timer.phase === "idle") return "IDLE";
  if (timer.phase === "paused") return "PAUSED";
  switch (timer.sessionType) {
    case "focus":
      return "FOCUS";
    case "short-break":
      return "SHORT BREAK";
    case "long-break":
      return "LONG BREAK";
    default:
      return "RUNNING";
  }
}

/**
 * Get the menu bar title string for the given timer state.
 */
export function getMenuBarTitle(
  timer: TimerState,
  remainingMs: number,
): string {
  if (timer.phase === "idle") return "sesh";

  const countdown = formatCountdown(remainingMs);

  if (timer.phase === "paused") return `⏸ ${countdown}`;
  if (timer.sessionType === "focus") return `⏱ ${countdown}`;
  return `☕ ${countdown}`;
}

/**
 * Session type display label.
 */
export function sessionTypeLabel(type: string): string {
  switch (type) {
    case "focus":
      return "Focus";
    case "short-break":
      return "Short Break";
    case "long-break":
      return "Long Break";
    default:
      return type;
  }
}
