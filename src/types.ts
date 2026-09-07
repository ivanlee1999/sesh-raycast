/**
 * Shapes returned by sesh-web's API.
 *
 * Kept deliberately close to `sesh-web/src/types/index.ts` — where the two
 * disagree the server wins, since it is the thing writing the database.
 */

/** What the server stores. The web UI's "long break" is a `break` with a longer target. */
export type SessionType = "focus" | "break";

export type TimerPhase =
  | "idle"
  | "running"
  | "paused"
  | "overflow"
  | "finished";

export interface TimerState {
  phase: TimerPhase | string;
  sessionType: SessionType | string;
  intention: string;
  category: string;
  targetMs: number;
  remainingMs: number;
  overflowMs: number;
  startedAt: number | null;
  pausedAt: number | null;
  updatedAt: number;
  /**
   * The tasks this session is against, comma-separated and provider-namespaced.
   * The column predates multi-provider support, hence the Todoist-shaped name.
   * Always read it through `./task-ref`.
   */
  todoistTaskId: string | null;
}

export interface Category {
  id: string;
  name: string;
  label: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
}

export interface Session {
  id: string;
  intention: string;
  category: string;
  type: string;
  targetMs: number;
  actualMs: number;
  overflowMs: number;
  startedAt: number;
  endedAt: number;
  notes: string;
  rating?: number;
  todoistTaskId?: string | null;
}

export interface AnalyticsDay {
  label: string;
  ms: number;
}

export interface Analytics {
  todayMs: number;
  todayCount: number;
  streak: number;
  days: AnalyticsDay[];
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export type TaskProvider = "todoist" | "things";

export const TASK_PROVIDERS: readonly TaskProvider[] = [
  "todoist",
  "things",
] as const;

export const PROVIDER_LABEL: Record<TaskProvider, string> = {
  todoist: "Todoist",
  things: "Things",
};

/**
 * A to-do pulled in from an external task manager. Todoist and Things both
 * normalise into this shape, so one list can show both.
 *
 * `provider` is optional because older payloads predate it — route through
 * `resolveProvider()` rather than reading it directly, or a Things uuid could
 * be sent to Todoist and 404 on every write.
 */
export interface ExternalTask {
  id: string;
  provider?: TaskProvider;
  content: string;
  duration: { amount: number; unit: "minute" } | null;
  labels: string[];
  priority: number;
  projectId?: string | null;
  projectName?: string;
  due?: "today" | "tomorrow" | "upcoming" | null;
  dueLabel?: string | null;
  dueDate?: string | null;
  bucket?: "today" | "inbox" | "anytime" | "upcoming" | "someday" | null;
  areaName?: string | null;
  category?: string | null;
  completed?: boolean;
}

export function resolveProvider(
  task: Pick<ExternalTask, "provider">,
): TaskProvider {
  return task.provider ?? "todoist";
}

/** Task ids are only unique within a provider, so key on both. */
export function taskKey(task: ExternalTask): string {
  return `${resolveProvider(task)}:${task.id}`;
}

export type TaskFilter = "today" | "upcoming" | "all";

export type ProviderState =
  | "connected"
  | "not_configured"
  | "auth_required"
  | "error";

export interface ProviderStatus {
  provider: TaskProvider;
  state: ProviderState;
  message: string;
}

/** Where a new Things to-do is filed. Mirrors the lists Things itself offers. */
export type NewTaskWhen = "today" | "anytime" | "someday" | "inbox";

// ── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  displayName: string;
  focusDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  sessionsBeforeLongBreak: number;
  soundEnabled: boolean;
  calendarSync: boolean;
  darkMode: boolean;
  keepScreenAwake: boolean;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  todoistEnabled: boolean;
  accentColor: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  displayName: "there",
  focusDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
  soundEnabled: true,
  calendarSync: false,
  darkMode: false,
  keepScreenAwake: true,
  autoStartBreak: true,
  autoStartFocus: false,
  todoistEnabled: true,
  accentColor: "#BE6E45",
};

/**
 * Absent means on. The setting can predate the flag, and an upgrade must not
 * quietly take Todoist away from someone who was using it.
 */
export function isTodoistEnabled(
  settings: Pick<AppSettings, "todoistEnabled"> | { todoistEnabled?: boolean },
): boolean {
  return settings.todoistEnabled !== false;
}

export function enabledProviders(settings: {
  todoistEnabled?: boolean;
}): TaskProvider[] {
  return TASK_PROVIDERS.filter(
    (provider) => provider !== "todoist" || isTodoistEnabled(settings),
  );
}
