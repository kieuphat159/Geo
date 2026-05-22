import { useCallback, useEffect, useRef, useState } from "react";
import AuthRouteLoading from "../components/AuthRouteLoading";
import HospitalDashboardPage from "../pages/HospitalDashboardPage";
import LoginPage from "../pages/LoginPage";
import ProfilePage from "../pages/ProfilePage";
import RegisterPage from "../pages/RegisterPage";
import SuperAdminDashboardPage from "../pages/SuperAdminDashboardPage";
import UserPage from "../pages/UserPage";
import { Navigate, useLocation } from "react-router-dom";
import {
    AUTH_SESSION_CHANGED_EVENT,
    clearSession,
    getStoredSession,
    homePathForRoleId,
    isAccessTokenExpired,
    normalizeKnownRoleId,
    refreshAccessToken,
    type AuthSession,
} from "../services/auth";

function RequireAuth({ children }: { children: JSX.Element }) {
    const session = getStoredSession();
    return session?.token ? children : <Navigate to="/login" replace />;
}

function useBackendResolvedSession(): { loading: boolean; session: AuthSession | null } {
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<AuthSession | null>(null);
    const syncingRef = useRef(false);

    const syncSession = useCallback(async () => {
        if (syncingRef.current) {
            return;
        }

        syncingRef.current = true;
        try {
            const cookieSession = getStoredSession();
            if (!cookieSession?.token) {
                setSession(null);
                setLoading(false);
                return;
            }

            setSession(cookieSession);

            if (!isAccessTokenExpired(cookieSession.token)) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const refreshed = await refreshAccessToken();
                setSession(refreshed ?? getStoredSession());
            } catch {
                setSession(getStoredSession());
            } finally {
                setLoading(false);
            }
        } finally {
            syncingRef.current = false;
        }
    }, []);

    useEffect(() => {
        void syncSession();
    }, [location.pathname, location.key, syncSession]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const handleAuthChange = () => {
            void syncSession();
        };

        window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleAuthChange);
        return () => {
            window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleAuthChange);
        };
    }, [syncSession]);

    return { loading, session };
}

function RequireRole({ expectedRoleId, children }: { expectedRoleId: 1 | 2; children: JSX.Element }) {
    const { loading, session } = useBackendResolvedSession();
    if (loading) return <AuthRouteLoading />;
    if (!session?.token) return <Navigate to="/login" replace />;
    const roleId = normalizeKnownRoleId(session);
    if (roleId === expectedRoleId) return children;
    return <Navigate to={homePathForRoleId(roleId)} replace />;
}

function RedirectIfAuthenticated({ children }: { children: JSX.Element }) {
    const { loading, session } = useBackendResolvedSession();
    if (loading) return <AuthRouteLoading />;
    if (!session?.token) return children;
    const roleId = normalizeKnownRoleId(session);
    if (roleId === null) {
        clearSession();
        return children;
    }
    return <Navigate to={homePathForRoleId(roleId)} replace />;
}

export const routes = [
    {
        path: "/",
        element: <UserPage />
    },
    {
        path: "/login",
        element: (
            <RedirectIfAuthenticated>
                <LoginPage />
            </RedirectIfAuthenticated>
        ),
    },
    {
        path: "/register",
        element: (
            <RedirectIfAuthenticated>
                <RegisterPage />
            </RedirectIfAuthenticated>
        ),
    },
    {
        path: "/user",
        element: <UserPage />
    },
    {
        path: "/admin",
        element: (
            <RequireRole expectedRoleId={2}>
                <HospitalDashboardPage />
            </RequireRole>
        ),
    },
    {
        path: "/super-admin",
        element: (
            <RequireRole expectedRoleId={1}>
                <SuperAdminDashboardPage />
            </RequireRole>
        ),
    },
    {
        path: "/hospital",
        element: <Navigate to="/admin" replace />,
    },
    {
        path: "/profile",
        element: (
            <RequireAuth>
                <ProfilePage />
            </RequireAuth>
        ),
    }
];
