export type AuthRole = "GUEST" | "USER" | "ADMIN" | "SUPER_ADMIN";

export interface AuthSession {
  token: string;
  refresh_token?: string;
  user: {
    id: number;
    email: string;
    role_id: number;
    role?: AuthRole;
    facility_id?: number | null;
  };
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    if (typeof atob !== "function") {
      return null;
    }
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = atob(normalized);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toKnownRoleId(roleIdRaw: unknown, roleRaw?: unknown): number | null {
  const roleId = Number(roleIdRaw);
  if (roleId === 1 || roleId === 2 || roleId === 3) {
    return roleId;
  }

  const roleText = typeof roleRaw === "string" ? roleRaw.trim().toUpperCase() : "";
  if (roleText === "SUPER_ADMIN") return 1;
  if (roleText === "ADMIN") return 2;
  if (roleText === "USER") return 3;
  return null;
}

/** Cookie used for the signed-in session (replaces legacy localStorage). */
export const AUTH_SESSION_COOKIE_NAME = "geo_auth_session";
/** Fired after saveSession / clearSession so route guards re-read cookie. */
export const AUTH_SESSION_CHANGED_EVENT = "geo-auth-session-changed";
const AUTH_LEGACY_LOCAL_KEY = "geo:auth-session";
const AUTH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const ACTIVE_TRACKING_HINT_KEY = "geo:has-active-tracking";
const ACTIVE_TRACKING_SNAPSHOT_KEY = "geo:active-tracking-snapshot";
const ANONYMOUS_SOS_SESSION_KEY = "geo:anonymous-sos-session";
const ANONYMOUS_SOS_DECLINED_KEY = "geo:anonymous-sos-declined";

function notifyAuthSessionChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

function clearAnonymousSosReconcileState(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(ANONYMOUS_SOS_SESSION_KEY);
    localStorage.removeItem(ANONYMOUS_SOS_DECLINED_KEY);
  } catch {
    /* ignore */
  }
}

function resolveApiUrl(pathname: string): URL {
  const configuredBaseUrl = import.meta.env.VITE_API_URL;
  const fallbackBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  return new URL(pathname, configuredBaseUrl || fallbackBaseUrl);
}

function readSessionCookieRaw(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(AUTH_SESSION_COOKIE_NAME)}=`;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

function writeSessionCookie(json: string) {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  const value = encodeURIComponent(json);
  const name = encodeURIComponent(AUTH_SESSION_COOKIE_NAME);
  document.cookie = `${name}=${value}; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function eraseSessionCookie() {
  if (typeof document === "undefined") return;
  const name = encodeURIComponent(AUTH_SESSION_COOKIE_NAME);
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function removeLegacyLocalSession() {
  try {
    localStorage.removeItem(AUTH_LEGACY_LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

function clearClientTrackingState() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_TRACKING_HINT_KEY);
    localStorage.removeItem(ACTIVE_TRACKING_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

function readStoredSessionWithoutMigration(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const fromCookie = readSessionCookieRaw();
  if (fromCookie) {
    try {
      return JSON.parse(fromCookie) as AuthSession;
    } catch {
      return null;
    }
  }

  const raw = localStorage.getItem(AUTH_LEGACY_LOCAL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const fromCookie = readSessionCookieRaw();
  if (fromCookie) {
    try {
      return JSON.parse(fromCookie) as AuthSession;
    } catch {
      eraseSessionCookie();
    }
  }

  const raw = localStorage.getItem(AUTH_LEGACY_LOCAL_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    saveSession(session);
    return session;
  } catch {
    localStorage.removeItem(AUTH_LEGACY_LOCAL_KEY);
    return null;
  }
}

export function getAuthToken(): string | null {
  return getStoredSession()?.token ?? null;
}

/** Backend role ids we trust for routing (1=SuperAdmin, 2=Hospital admin, 3=User). */
/** True when JWT access token is missing exp or within skew seconds of expiry. */
export function isAccessTokenExpired(token: string, skewSeconds = 45): boolean {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) {
    return true;
  }
  return Date.now() >= (exp - skewSeconds) * 1000;
}

export function normalizeKnownRoleId(session: AuthSession | null): number | null {
  if (session?.user) {
    const fromUser = toKnownRoleId(session.user.role_id, session.user.role);
    if (fromUser !== null) {
      return fromUser;
    }
  }

  if (!session?.token) return null;
  const payload = parseJwtPayload(session.token);
  return toKnownRoleId(payload?.role_id);
}

/** Single destination per role so `/admin` and `/super-admin` never redirect in a loop. */
export function homePathForRoleId(roleId: number | null): string {
  if (roleId === 1) return "/super-admin";
  if (roleId === 2) return "/admin";
  return "/";
}

export function saveSession(session: AuthSession) {
  const previous = readStoredSessionWithoutMigration();
  const previousUserId = previous?.user?.id != null ? Number(previous.user.id) : null;
  const nextUserId = session?.user?.id != null ? Number(session.user.id) : null;
  if (
    previousUserId !== null &&
    nextUserId !== null &&
    Number.isFinite(previousUserId) &&
    Number.isFinite(nextUserId) &&
    previousUserId !== nextUserId
  ) {
    clearClientTrackingState();
  }
  writeSessionCookie(JSON.stringify(session));
  removeLegacyLocalSession();

  const roleId = toKnownRoleId(session.user.role_id, session.user.role);
  if (roleId !== 3) {
    clearAnonymousSosReconcileState();
  }
  notifyAuthSessionChanged();
}

/** Clears cookie/local auth artifacts and in-flight refresh state. */
export function clearSession() {
  refreshPromise = null;
  eraseSessionCookie();
  removeLegacyLocalSession();
  clearClientTrackingState();
  notifyAuthSessionChanged();
}

/** Logout helper — same as clearSession (no separate React auth context in this app). */
export function logout(): void {
  clearSession();
}

let refreshPromise: Promise<AuthSession | null> | null = null;

export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(resolveApiUrl("/api/auth/login").toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Đăng nhập thất bại");
  }

  const data = payload?.data;
  return finalizeAuthSession(data);
}

export async function register(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(resolveApiUrl("/api/auth/register").toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Đăng ký thất bại");
  }

  return finalizeAuthSession(payload?.data);
}

export async function loginWithGoogle(idToken: string): Promise<AuthSession> {
  const response = await fetch(resolveApiUrl("/api/auth/google").toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Đăng nhập Google thất bại");
  }

  return finalizeAuthSession(payload?.data);
}

async function finalizeAuthSession(data: any): Promise<AuthSession> {
  const normalizedRoleId = toKnownRoleId(data?.user?.role_id, data?.user?.role);
  const facilityRaw = data?.user?.facility_id ?? data?.user?.facility?.id;
  const facilityId =
    facilityRaw === null || facilityRaw === undefined || facilityRaw === ""
      ? null
      : Number(facilityRaw);
  const session: AuthSession = {
    token: data.token,
    refresh_token: data.refresh_token,
    user: {
      ...data.user,
      role_id: normalizedRoleId ?? 0,
      facility_id: Number.isFinite(facilityId) ? facilityId : null,
    },
  };
  saveSession(session);
  return session;
}

export async function refreshAccessToken(): Promise<AuthSession | null> {
  const currentSession = getStoredSession();
  const refreshTokenAtStart = currentSession?.refresh_token;
  if (!refreshTokenAtStart) {
    clearSession();
    return null;
  }

  const response = await fetch(resolveApiUrl("/api/auth/refresh-token").toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: refreshTokenAtStart }),
  });

  const latestBeforeApply = getStoredSession();
  if (!latestBeforeApply?.refresh_token || latestBeforeApply.refresh_token !== refreshTokenAtStart) {
    return latestBeforeApply;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    clearSession();
    return null;
  }

  const latestAfterFetch = getStoredSession();
  if (!latestAfterFetch?.refresh_token || latestAfterFetch.refresh_token !== refreshTokenAtStart) {
    return latestAfterFetch;
  }

  const data = payload?.data;
  const normalizedRoleId = toKnownRoleId(
    data?.user?.role_id ?? currentSession.user.role_id,
    data?.user?.role ?? currentSession.user.role,
  );
  const facilityRaw = data?.user?.facility_id ?? data?.user?.facility?.id ?? currentSession.user.facility_id;
  const facilityId =
    facilityRaw === null || facilityRaw === undefined || facilityRaw === ""
      ? null
      : Number(facilityRaw);
  const nextSession: AuthSession = {
    token: data?.token,
    refresh_token: data?.refresh_token ?? refreshTokenAtStart,
    user: data?.user
      ? {
          ...data.user,
          role_id: normalizedRoleId ?? currentSession.user.role_id,
          facility_id: Number.isFinite(facilityId) ? facilityId : currentSession.user.facility_id ?? null,
        }
      : currentSession.user,
  };
  saveSession(nextSession);
  return nextSession;
}

async function ensureFreshSession(): Promise<AuthSession | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = refreshAccessToken();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function authorizedFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const session = getStoredSession();
  const headers = new Headers(init.headers || {});
  headers.set("Accept", headers.get("Accept") || "application/json");
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  // Avoid browser conditional-cache requests (If-None-Match/If-Modified-Since)
  // for API calls because our response handlers expect a JSON body.
  const requestInit: RequestInit = { cache: "no-store", ...init, headers };

  let response = await fetch(input, requestInit);
  if (response.status !== 401) {
    return response;
  }

  const refreshed = await ensureFreshSession();
  if (!refreshed?.token) {
    return response;
  }

  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set("Accept", retryHeaders.get("Accept") || "application/json");
  retryHeaders.set("Authorization", `Bearer ${refreshed.token}`);
  response = await fetch(input, { ...requestInit, headers: retryHeaders });
  return response;
}

