import { authorizedFetch } from "./auth";

export const ANONYMOUS_SOS_SESSION_KEY = "geo:anonymous-sos-session";
export const ANONYMOUS_SOS_DECLINED_KEY = "geo:anonymous-sos-declined";

export interface AnonymousSosSession {
    session_token: string;
    request_id: number;
    saved_at: number;
}

export interface AnonymousSosPreview {
    valid: boolean;
    request_id?: number;
    status?: string;
    is_active?: boolean;
    linkable?: boolean;
    already_linked?: boolean;
    reason?: string;
}

function resolveApiUrl(pathname: string): URL {
    const configuredBaseUrl = import.meta.env.VITE_API_URL;
    const fallbackBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
    return new URL(pathname, configuredBaseUrl || fallbackBaseUrl);
}

export function readAnonymousSosSession(): AnonymousSosSession | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = localStorage.getItem(ANONYMOUS_SOS_SESSION_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as AnonymousSosSession;
        if (
            typeof parsed.session_token === "string" &&
            parsed.session_token.trim() &&
            typeof parsed.request_id === "number" &&
            Number.isFinite(parsed.request_id)
        ) {
            return parsed;
        }
    } catch {
        /* ignore */
    }

    return null;
}

export function saveAnonymousSosSession(session_token: string, request_id: number): void {
    if (typeof window === "undefined") {
        return;
    }

    const payload: AnonymousSosSession = {
        session_token,
        request_id,
        saved_at: Date.now(),
    };

    try {
        localStorage.setItem(ANONYMOUS_SOS_SESSION_KEY, JSON.stringify(payload));
        localStorage.removeItem(ANONYMOUS_SOS_DECLINED_KEY);
    } catch {
        /* ignore */
    }
}

export function clearAnonymousSosSession(): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        localStorage.removeItem(ANONYMOUS_SOS_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

/** Xóa toàn bộ state reconcile SOS ẩn danh trên client (khi admin/guest khác đăng nhập). */
export function clearAnonymousSosReconcileState(): void {
    clearAnonymousSosSession();
    if (typeof window === "undefined") {
        return;
    }
    try {
        localStorage.removeItem(ANONYMOUS_SOS_DECLINED_KEY);
    } catch {
        /* ignore */
    }
}

export function markAnonymousSosDeclined(requestId: number): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        localStorage.setItem(ANONYMOUS_SOS_DECLINED_KEY, String(requestId));
        localStorage.removeItem(ANONYMOUS_SOS_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

function wasAnonymousSosDeclined(requestId: number): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    return localStorage.getItem(ANONYMOUS_SOS_DECLINED_KEY) === String(requestId);
}

export async function fetchAnonymousSosPreview(sessionToken: string): Promise<AnonymousSosPreview | null> {
    const url = resolveApiUrl("/api/emergency/anonymous-session");
    url.searchParams.set("session_token", sessionToken);

    try {
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
        });

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as { data?: AnonymousSosPreview };
        return payload?.data ?? null;
    } catch {
        return null;
    }
}

export async function linkAnonymousSosSession(sessionToken: string, requestId: number): Promise<boolean> {
    try {
        const response = await authorizedFetch(resolveApiUrl("/api/emergency/link-anonymous-session").toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_token: sessionToken,
                request_id: requestId,
            }),
        });

        if (!response.ok) {
            return false;
        }

        clearAnonymousSosSession();
        return true;
    } catch {
        return false;
    }
}

export type ReconcileOffer =
    | { kind: "none" }
    | {
          kind: "prompt";
          session: AnonymousSosSession;
          isActive: boolean;
          status?: string;
      };

export async function resolveAnonymousReconcileOffer(): Promise<ReconcileOffer> {
    const stored = readAnonymousSosSession();
    if (!stored) {
        return { kind: "none" };
    }

    if (wasAnonymousSosDeclined(stored.request_id)) {
        clearAnonymousSosSession();
        return { kind: "none" };
    }

    const preview = await fetchAnonymousSosPreview(stored.session_token);
    if (!preview?.valid) {
        clearAnonymousSosSession();
        return { kind: "none" };
    }

    if (preview.already_linked || preview.linkable === false) {
        clearAnonymousSosSession();
        return { kind: "none" };
    }

    return {
        kind: "prompt",
        session: stored,
        isActive: Boolean(preview.is_active),
        status: preview.status,
    };
}
