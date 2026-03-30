export interface TimerState {
  phase: string;
  sessionType: string;
  intention: string;
  category: string;
  targetMs: number;
  remainingMs: number;
  overflowMs: number;
  startedAt: number | null;
  pausedAt: number | null;
  updatedAt: number;
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
