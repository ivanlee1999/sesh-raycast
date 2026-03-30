import { getPreferenceValues, showToast, Toast } from "@raycast/api";
import type { TimerState, Category, Session, Analytics } from "./types";

interface Preferences {
  serverUrl: string;
  defaultDuration: string;
}

export function getPreferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

export function getBaseUrl(): string {
  const { serverUrl } = getPreferences();
  return serverUrl.replace(/\/+$/, "");
}

export function getDefaultDurationMinutes(): number {
  const { defaultDuration } = getPreferences();
  const parsed = parseInt(defaultDuration, 10);
  if (isNaN(parsed) || parsed < 1) return 25;
  if (parsed > 180) return 180;
  return parsed;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    const msg = `Cannot connect to sesh server at ${getBaseUrl()}`;
    await showToast({
      style: Toast.Style.Failure,
      title: "Connection Error",
      message: msg,
    });
    throw new Error(msg);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `Request failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`;
    await showToast({
      style: Toast.Style.Failure,
      title: "API Error",
      message: msg,
    });
    throw new Error(msg);
  }

  // Handle 204 No Content and empty bodies gracefully
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

// ── Timer ────────────────────────────────────────────────────────────────────

export async function getTimer(): Promise<TimerState> {
  return request<TimerState>("/api/timer");
}

export async function putTimer(body: Partial<TimerState>): Promise<TimerState> {
  return request<TimerState>("/api/timer", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export interface CompleteSessionPayload {
  startedAt: string;
  intention?: string | null;
  category?: string | null;
  notes?: string | null;
}

export async function completeSession(
  body: CompleteSessionPayload,
): Promise<void> {
  await request<unknown>("/api/timer", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  return request<Category[]>("/api/categories");
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  return request<Session[]>("/api/sessions");
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalytics(): Promise<Analytics> {
  return request<Analytics>("/api/analytics");
}

// ── URL helpers (for useFetch) ───────────────────────────────────────────────

export function timerUrl(): string {
  return `${getBaseUrl()}/api/timer`;
}

export function categoriesUrl(): string {
  return `${getBaseUrl()}/api/categories`;
}

export function sessionsUrl(): string {
  return `${getBaseUrl()}/api/sessions`;
}

export function analyticsUrl(): string {
  return `${getBaseUrl()}/api/analytics`;
}
