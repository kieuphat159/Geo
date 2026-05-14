import HospitalDashboardPage from "../pages/HospitalDashboardPage";
import LoginPage from "../pages/LoginPage";
import ProfilePage from "../pages/ProfilePage";
import RegisterPage from "../pages/RegisterPage";
import SuperAdminDashboardPage from "../pages/SuperAdminDashboardPage";
import UserPage from "../pages/UserPage";
import { Navigate } from "react-router-dom";
import { getStoredSession, homePathForRoleId, normalizeKnownRoleId } from "../services/auth";

function RequireAuth({ children }: { children: JSX.Element }) {
    const session = getStoredSession();
    return session?.token ? children : <Navigate to="/login" replace />;
}

function RedirectIfAuthenticated({ children }: { children: JSX.Element }) {
    const session = getStoredSession();
    if (!session?.token) {
        return children;
    }

    const roleId = Number(session.user.role_id);

    if (roleId === 1) {
        return <Navigate to="/super-admin" replace />;
    }

    if (roleId === 2) {
        return <Navigate to="/admin" replace />;
    }

    return <Navigate to="/" replace />;
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
            <RequireAuth>
                {(() => {
                    const roleId = normalizeKnownRoleId(getStoredSession());
                    if (roleId === 2) return <HospitalDashboardPage />;
                    return <Navigate to={homePathForRoleId(roleId)} replace />;
                })()}
            </RequireAuth>
        ),
    },
    {
        path: "/super-admin",
        element: (
            <RequireAuth>
                {(() => {
                    const roleId = normalizeKnownRoleId(getStoredSession());
                    if (roleId === 1) return <SuperAdminDashboardPage />;
                    return <Navigate to={homePathForRoleId(roleId)} replace />;
                })()}
            </RequireAuth>
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