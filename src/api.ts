import {
  getPreferenceValues,
  showToast,
  Toast,
  LocalStorage,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import {
  DEFAULT_SETTINGS,
  enabledProviders,
  PROVIDER_LABEL,
  type Analytics,
  type AppSettings,
  type Category,
  type ExternalTask,
  type NewTaskWhen,
  type ProviderStatus,
  type Session,
  type TaskFilter,
  type TaskProvider,
  type TimerState,
} from "./types";

interface Preferences {
  serverUrl: string;
  defaultDuration: string;
  authUsername?: string;
  authPassword?: string;
}

/** Gates the whole app. Issued by `POST /api/login`. */
const APP_SESSION_COOKIE = "sesh_app_session";
/**
 * Gates the task proxies on top of the app session, because those routes hand
 * out the server's Todoist token and Things credentials. sesh-web's middleware
 * only issues it on a *page* request, so we ask for the app shell to get one.
 */
const PROXY_COOKIE = "todoist_proxy_auth";

const SESSION_STORAGE_KEY = "sesh.app-session-cookie";
const PROXY_STORAGE_KEY = "sesh.proxy-cookie";

interface CookieJar {
  session?: string;
  proxy?: string;
}

let cachedJar: CookieJar | undefined;

class AuthError extends Error {}

export function getPreferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

export function getBaseUrl(): string {
  const { serverUrl } = getPreferences();
  return serverUrl.replace(/\/+$/, "");
}

/**
 * The fallback focus length. The server's own setting is the real answer and
 * commands prefer it; this covers the case where settings cannot be reached.
 */
export function getDefaultDurationMinutes(): number {
  const { defaultDuration } = getPreferences();
  const parsed = parseInt(defaultDuration, 10);
  if (isNaN(parsed) || parsed < 1) return 25;
  if (parsed > 180) return 180;
  return parsed;
}

// ── Cookies ──────────────────────────────────────────────────────────────────

async function getJar(): Promise<CookieJar> {
  if (cachedJar !== undefined) return cachedJar;
  const [session, proxy] = await Promise.all([
    LocalStorage.getItem<string>(SESSION_STORAGE_KEY),
    LocalStorage.getItem<string>(PROXY_STORAGE_KEY),
  ]);
  cachedJar = { session: session ?? undefined, proxy: proxy ?? undefined };
  return cachedJar;
}

async function persistJar(jar: CookieJar): Promise<void> {
  cachedJar = jar;
  await Promise.all([
    jar.session
      ? LocalStorage.setItem(SESSION_STORAGE_KEY, jar.session)
      : LocalStorage.removeItem(SESSION_STORAGE_KEY),
    jar.proxy
      ? LocalStorage.setItem(PROXY_STORAGE_KEY, jar.proxy)
      : LocalStorage.removeItem(PROXY_STORAGE_KEY),
  ]);
}

function cookieHeader(jar: CookieJar): string | undefined {
  const parts: string[] = [];
  if (jar.session) parts.push(`${APP_SESSION_COOKIE}=${jar.session}`);
  if (jar.proxy) parts.push(`${PROXY_COOKIE}=${jar.proxy}`);
  return parts.length > 0 ? parts.join("; ") : undefined;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extended.getSetCookie === "function") {
    const values = extended.getSetCookie();
    if (values.length > 0) return values;
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function extractCookie(headers: Headers, name: string): string | undefined {
  const pattern = new RegExp(`(?:^|[;,]\\s*)${name}=([^;]+)`);
  for (const value of getSetCookieHeaders(headers)) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

// ── Errors ───────────────────────────────────────────────────────────────────

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

/**
 * Pull a readable line out of an error response. sesh sits behind a tunnel and
 * a CDN, either of which answers a bad gateway with a full HTML page — which
 * says nothing the status line does not, so it is dropped rather than shown.
 */
async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  let detail = "";
  try {
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const data = await response.clone().json();
      detail =
        typeof data?.error === "string"
          ? data.error
          : typeof data?.message === "string"
            ? data.message
            : "";
    } else {
      const body = (await response.clone().text()).trim();
      detail = type.includes("text/html") || body.startsWith("<") ? "" : body;
    }
  } catch {
    detail = "";
  }
  detail = detail.replace(/\s+/g, " ").trim();
  if (detail.length > 200) detail = `${detail.slice(0, 200).trimEnd()}...`;
  const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  return `${fallback} (${detail ? `${status}: ${detail}` : status})`;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function rawFetch(
  path: string,
  init: RequestInit,
  jar: CookieJar,
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const cookie = cookieHeader(jar);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${getBaseUrl()}${path}`, { ...init, headers });
}

/**
 * Sign in to the shared app login.
 *
 * Returns undefined rather than throwing when the deployment has app auth
 * switched off — there is simply no session cookie to hold in that case, and
 * the proxy cookie below is still needed.
 */
async function login(): Promise<string | undefined> {
  const { authUsername, authPassword } = getPreferences();
  const username = authUsername?.trim() ?? "";
  const password = authPassword ?? "";
  if (!username || !password) return undefined;

  const body = new URLSearchParams({ username, password, next: "/" });

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

  const cookie = extractCookie(res.headers, APP_SESSION_COOKIE);
  if (cookie) return cookie;

  // sesh-web bounces a bad password back to /login rather than answering 401.
  const location = res.headers.get("location") ?? "";
  if (location.startsWith("/login")) {
    throw new AuthError(
      "Login failed. Check the sesh Raycast App Username and App Password preferences.",
    );
  }
  // Anything else means the server is not gating on a session at all.
  return undefined;
}

/**
 * Ask for the app shell so the middleware issues the task-proxy cookie. It is
 * only handed out on page navigations, so the Accept header matters.
 */
async function fetchProxyCookie(jar: CookieJar): Promise<string | undefined> {
  let res: Response;
  try {
    res = await rawFetch(
      "/",
      { method: "GET", redirect: "manual", headers: { Accept: "text/html" } },
      jar,
    );
  } catch {
    return showConnectionError();
  }
  return extractCookie(res.headers, PROXY_COOKIE);
}

/**
 * Re-establish both cookies from scratch. Used on the first call and whenever
 * the server answers 401 — the app session may have expired, or the proxy
 * cookie may never have been issued because Raycast never loads a page.
 */
async function refreshAuth(): Promise<CookieJar> {
  const session = await login();
  const jar: CookieJar = { session, proxy: undefined };
  jar.proxy = await fetchProxyCookie(jar);
  await persistJar(jar);
  if (!session && !jar.proxy) {
    throw new AuthError(
      "Set App Username and App Password in the sesh Raycast extension preferences, and confirm the server URL.",
    );
  }
  return jar;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let jar = await getJar();
  let res: Response;

  try {
    res = await rawFetch(path, init ?? {}, jar);
  } catch {
    return showConnectionError();
  }

  if (res.status === 401) {
    try {
      jar = await refreshAuth();
    } catch (err) {
      await persistJar({});
      if (err instanceof AuthError) return showAuthError(err.message);
      throw err;
    }
    try {
      res = await rawFetch(path, init ?? {}, jar);
    } catch {
      return showConnectionError();
    }
  }

  if (res.status === 401) {
    await persistJar({});
    return showAuthError(
      "Signed in, but the sesh server still rejected the request. Confirm the server URL and app credentials in preferences.",
    );
  }

  if (!res.ok) {
    const msg = await readApiError(res, "Request failed");
    await showToast({
      style: Toast.Style.Failure,
      title: "API Error",
      message: msg,
    });
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Like `request`, but reports the failure to the caller instead of raising a
 * toast. Used where one provider being down must not hide the other.
 */
async function tryRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await request<T>(path, init) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Request failed",
    };
  }
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ── Timer ────────────────────────────────────────────────────────────────────

export async function getTimer(): Promise<TimerState> {
  return request<TimerState>("/api/timer");
}

export async function putTimer(body: Partial<TimerState>): Promise<TimerState> {
  return request<TimerState>("/api/timer", jsonInit("PUT", body));
}

export interface CompleteSessionPayload {
  startedAt: number;
  intention?: string | null;
  notes?: string | null;
  rating?: number;
}

export interface CompleteSessionResult {
  completed: boolean;
  timer?: TimerState | null;
  session?: Session;
}

/**
 * Finish the running session. The server owns the arithmetic: it compares and
 * swaps on `startedAt`, so a session the web app or the background completer
 * already saved comes back as `completed: false` rather than being written
 * twice. It also logs the minutes to any linked task on its own.
 */
export async function completeSession(
  body: CompleteSessionPayload,
): Promise<CompleteSessionResult> {
  return request<CompleteSessionResult>("/api/timer", jsonInit("POST", body));
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  return request<Category[]>("/api/categories");
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  return request<Session[]>("/api/sessions");
}

/** Upsert a session — the server overwrites only the fields a person can edit. */
export async function saveSession(session: Session): Promise<void> {
  await request<unknown>("/api/sessions", jsonInit("POST", session));
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalytics(): Promise<Analytics> {
  return request<Analytics>("/api/analytics");
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const stored = await request<Partial<AppSettings>>("/api/settings");
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

// ── Tasks ────────────────────────────────────────────────────────────────────

function providerBase(provider: TaskProvider): string {
  return `/api/${provider}`;
}

/** The zone the tasks are bucketed against — sesh-web normally runs in UTC. */
function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

async function checkProvider(provider: TaskProvider): Promise<ProviderStatus> {
  const label = PROVIDER_LABEL[provider];
  const result = await tryRequest<{
    configured?: boolean;
    reachable?: boolean;
  }>(`${providerBase(provider)}/status`);
  if (!result.ok) {
    return { provider, state: "error", message: result.message };
  }
  if (!result.data?.configured) {
    return {
      provider,
      state: "not_configured",
      message:
        provider === "todoist"
          ? "Set TODOIST_API_TOKEN on the sesh server to pull tasks."
          : "Connect Things 3 in sesh Settings to pull tasks.",
    };
  }
  // Things reports reachability separately: configured, but the service is down.
  if (result.data.reachable === false) {
    return { provider, state: "error", message: `${label} is not reachable.` };
  }
  return { provider, state: "connected", message: `${label} connected` };
}

export async function getProviderStatuses(
  providers: TaskProvider[],
): Promise<ProviderStatus[]> {
  return Promise.all(providers.map(checkProvider));
}

export interface LoadedTasks {
  tasks: ExternalTask[];
  /** Provider-keyed failures, so a partial list can still be shown. */
  errors: { provider: TaskProvider; message: string }[];
  /** Some provider is still replaying history; the list will grow on its own. */
  syncing: boolean;
}

/**
 * Merge the to-dos from every enabled provider. One provider being down,
 * unconfigured or slow must never hide the other, so failures are collected
 * alongside the tasks that did load rather than thrown.
 */
export async function loadTasks(
  filter: TaskFilter,
  providers: TaskProvider[],
): Promise<LoadedTasks> {
  const tz = viewerTimeZone();
  const query = `filter=${filter}${tz ? `&tz=${encodeURIComponent(tz)}` : ""}`;

  const settled = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      result: await tryRequest<{ tasks?: ExternalTask[]; syncing?: boolean }>(
        `${providerBase(provider)}/tasks?${query}`,
      ),
    })),
  );

  const tasks: ExternalTask[] = [];
  const errors: { provider: TaskProvider; message: string }[] = [];
  let syncing = false;

  for (const { provider, result } of settled) {
    if (!result.ok) {
      errors.push({ provider, message: result.message });
      continue;
    }
    tasks.push(
      ...((result.data?.tasks ?? []) as ExternalTask[]).map((task) => ({
        ...task,
        provider,
      })),
    );
    syncing = syncing || Boolean(result.data?.syncing);
  }

  return { tasks, errors, syncing };
}

/**
 * Which providers sesh can add a to-do to. Todoist is read-and-complete only —
 * offering a control that quietly does nothing is worse than not offering it.
 */
export function canCreateTasks(provider: TaskProvider): boolean {
  return provider === "things";
}

export async function createTask(
  provider: TaskProvider,
  input: { title: string; when: NewTaskWhen },
): Promise<void> {
  if (!canCreateTasks(provider)) {
    throw new Error(
      `${PROVIDER_LABEL[provider]} to-dos cannot be created from sesh`,
    );
  }
  const tz = viewerTimeZone();
  await request<unknown>(
    `${providerBase(provider)}/tasks${tz ? `?tz=${encodeURIComponent(tz)}` : ""}`,
    jsonInit("POST", input),
  );
}

export async function completeTask(
  provider: TaskProvider,
  taskId: string,
): Promise<void> {
  await request<unknown>(
    `${providerBase(provider)}/tasks/${encodeURIComponent(taskId)}/close`,
    { method: "POST" },
  );
}

/** Record focused minutes against a task. Todoist gets a duration; Things a note. */
export async function recordFocusTime(
  provider: TaskProvider,
  taskId: string,
  minutes: number,
): Promise<void> {
  await request<unknown>(
    `${providerBase(provider)}/tasks/${encodeURIComponent(taskId)}/duration`,
    jsonInit("POST", { add_minutes: Math.max(1, Math.round(minutes)) }),
  );
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

export function useSettings() {
  return usePromise(getSettings);
}

/**
 * The to-do list, with the provider set taken from the server's own settings —
 * a provider switched off in sesh is not queried at all, so "off" means nothing
 * goes near it rather than its results being hidden after the fact.
 */
export function useTasks(filter: TaskFilter) {
  return usePromise(
    async (taskFilter: TaskFilter) => {
      const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
      const providers = enabledProviders(settings);
      const [loaded, statuses] = await Promise.all([
        loadTasks(taskFilter, providers),
        getProviderStatuses(providers),
      ]);
      return { ...loaded, statuses, providers };
    },
    [filter],
  );
}
