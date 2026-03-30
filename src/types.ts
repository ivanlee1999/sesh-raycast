export type TimerPhase = "idle" | "running" | "paused";
export type SessionType = "focus" | "short-break" | "long-break";

export interface TimerState {
  phase: TimerPhase;
  sessionType: SessionType;
  intention: string | null;
  category: string | null;
  targetMs: number;
  remainingMs: number;
  overflowMs: number;
  startedAt: string | null;
  pausedAt: string | null;
  updatedAt: string;
  todoistTaskId?: string | null;
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
  intention: string | null;
  category: string | null;
  type: SessionType;
  targetMs: number;
  actualMs: number;
  overflowMs: number;
  startedAt: string;
  endedAt: string;
  notes: string | null;
}

export interface AnalyticsDay {
  date: string;
  totalMs: number;
  count: number;
  categories: Record<string, number>;
}

export interface CategoryBreakdown {
  category: string;
  totalMs: number;
  count: number;
}

export interface Analytics {
  todayMs: number;
  todayCount: number;
  streak: number;
  days: AnalyticsDay[];
  categoryBreakdown: CategoryBreakdown[];
}
