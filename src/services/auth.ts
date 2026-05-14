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

/** Cookie used for the signed-in session (replaces legacy localStorage). */
export const AUTH_SESSION_COOKIE_NAME = "geo_auth_session";
const AUTH_LEGACY_LOCAL_KEY = "geo:auth-session";
const GUEST_UUID_STORAGE_KEY = "geo:guest-uuid";
const AUTH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

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
export function normalizeKnownRoleId(session: AuthSession | null): number | null {
  if (!session?.user) return null;
  const n = Number(session.user.role_id);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

/** Single destination per role so `/admin` and `/super-admin` never redirect in a loop. */
export function homePathForRoleId(roleId: number | null): string {
  if (roleId === 1) return "/super-admin";
  if (roleId === 2) return "/admin";
  return "/";
}

export function saveSession(session: AuthSession) {
  writeSessionCookie(JSON.stringify(session));
  removeLegacyLocalSession();
}

export function clearSession() {
  eraseSessionCookie();
  removeLegacyLocalSession();
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
  const normalizedRoleId = Number(data?.user?.role_id ?? 0);
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
      role_id: Number.isFinite(normalizedRoleId) ? normalizedRoleId : 0,
      facility_id: Number.isFinite(facilityId) ? facilityId : null,
    },
  };
  saveSession(session);
  await linkGuestAccountIfAvailable(session.token);
  return session;
}

export async function refreshAccessToken(): Promise<AuthSession | null> {
  const currentSession = getStoredSession();
  const refreshToken = currentSession?.refresh_token;
  if (!refreshToken) {
    clearSession();
    return null;
  }

  const response = await fetch(resolveApiUrl("/api/auth/refresh-token").toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    clearSession();
    return null;
  }

  const data = payload?.data;
  const normalizedRoleId = Number(data?.user?.role_id ?? currentSession.user.role_id ?? 0);
  const facilityRaw = data?.user?.facility_id ?? data?.user?.facility?.id ?? currentSession.user.facility_id;
  const facilityId =
    facilityRaw === null || facilityRaw === undefined || facilityRaw === ""
      ? null
      : Number(facilityRaw);
  const nextSession: AuthSession = {
    token: data?.token,
    refresh_token: data?.refresh_token ?? refreshToken,
    user: data?.user
      ? {
          ...data.user,
          role_id: Number.isFinite(normalizedRoleId) ? normalizedRoleId : currentSession.user.role_id,
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

async function linkGuestAccountIfAvailable(token: string): Promise<void> {
  const guestUuid = localStorage.getItem(GUEST_UUID_STORAGE_KEY);
  if (!guestUuid || !guestUuid.trim()) {
    return;
  }

  try {
    await fetch(resolveApiUrl("/api/auth/link-guest-account").toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ guest_uuid: guestUuid }),
    });
  } catch (error) {
    console.warn("Guest account linking failed", error);
  }
}
