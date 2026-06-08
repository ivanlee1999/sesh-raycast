import { getPreferenceValues, showToast, Toast, LocalStorage } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import type { TimerState, Category, Session, Analytics } from "./types";

interface Preferences {
  serverUrl: string;
  defaultDuration: string;
  authUsername?: string;
  authPassword?: string;
}

const APP_SESSION_COOKIE = "sesh_app_session";
const SESSION_STORAGE_KEY = "sesh.app-session-cookie";

let cachedSessionCookie: string | null | undefined;

class AuthError extends Error {}

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

async function getStoredSessionCookie(): Promise<string | undefined> {
  if (cachedSessionCookie !== undefined) {
    return cachedSessionCookie ?? undefined;
  }

  const stored = await LocalStorage.getItem<string>(SESSION_STORAGE_KEY);
  cachedSessionCookie = stored ?? null;
  return stored ?? undefined;
}

async function persistSessionCookie(cookieValue?: string): Promise<void> {
  cachedSessionCookie = cookieValue ?? null;

  if (cookieValue) {
    await LocalStorage.setItem(SESSION_STORAGE_KEY, cookieValue);
  } else {
    await LocalStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function buildSessionCookieHeader(cookieValue: string): string {
  return `${APP_SESSION_COOKIE}=${cookieValue}`;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extendedHeaders.getSetCookie === "function") {
    const values = extendedHeaders.getSetCookie();
    if (values.length > 0) {
      return values;
    }
  }

  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function extractSessionCookie(headers: Headers): string | undefined {
  const pattern = new RegExp(`${APP_SESSION_COOKIE}=([^;]+)`);

  for (const value of getSetCookieHeaders(headers)) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

async function showConnectionError(): Promise<never> {
  const msg = `Cannot connect to sesh server at ${getBaseUrl()}`;
  await showToast({
    style: Toast.Style.Failure,
    title: "Connection Error",
    message: msg,
  });
  throw new Error(msg);
}

async function showAuthError(message: string): Promise<never> {
  await showToast({
    style: Toast.Style.Failure,
    title: "Authentication Required",
    message,
  });
  throw new Error(message);
}

async function fetchWithSessionCookie(
  path: string,
  init?: RequestInit,
  sessionCookie?: string,
): Promise<Response> {
  const url = `${getBaseUrl()}${path}`;
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (sessionCookie) {
    headers.set("Cookie", buildSessionCookieHeader(sessionCookie));
  }

  return fetch(url, {
    ...init,
    headers,
  });
}

async function loginAndPersistSessionCookie(): Promise<string> {
  const { authUsername, authPassword } = getPreferences();
  const username = authUsername?.trim() ?? "";
  const password = authPassword ?? "";

  if (!username || !password) {
    throw new AuthError(
      "Set App Username and App Password in the sesh Raycast extension preferences.",
    );
  }

  const body = new URLSearchParams({
    username,
    password,
    next: "/",
  });

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/api/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch {
    return showConnectionError();
  }

  const sessionCookie = extractSessionCookie(res.headers);
  if (!sessionCookie) {
    throw new AuthError(
      "Login failed. Check the sesh Raycast App Username and App Password preferences.",
    );
  }

  await persistSessionCookie(sessionCookie);
  return sessionCookie;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  let sessionCookie = await getStoredSessionCookie();

  try {
    res = await fetchWithSessionCookie(path, init, sessionCookie);
  } catch {
    return showConnectionError();
  }

  if (res.status === 401) {
    try {
      sessionCookie = await loginAndPersistSessionCookie();
    } catch (err) {
      await persistSessionCookie(undefined);
      if (err instanceof AuthError) {
        return showAuthError(err.message);
      }
      throw err;
    }

    try {
      res = await fetchWithSessionCookie(path, init, sessionCookie);
    } catch {
      return showConnectionError();
    }
  }

  if (res.status === 401) {
    await persistSessionCookie(undefined);
    return showAuthError(
      "Login succeeded but the sesh server still rejected the request. Re-open Raycast preferences and confirm the server URL and app credentials.",
    );
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
  startedAt: number;
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

// ── Raycast hooks ────────────────────────────────────────────────────────────

export function useTimer() {
  return usePromise(getTimer);
}

export function useCategories() {
  return usePromise(getCategories);
}

export function useSessions() {
  return usePromise(getSessions);
}

export function useAnalytics() {
  return usePromise(getAnalytics);
}
