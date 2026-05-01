import HospitalDashboardPage from "../pages/HospitalDashboardPage";
import LoginPage from "../pages/LoginPage";
import ProfilePage from "../pages/ProfilePage";
import RegisterPage from "../pages/RegisterPage";
import SuperAdminDashboardPage from "../pages/SuperAdminDashboardPage";
import UserPage from "../pages/UserPage";
import { Navigate } from "react-router-dom";
import { getStoredSession } from "../services/auth";

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
                {Number(getStoredSession()?.user?.role_id) === 2 ? (
                    <HospitalDashboardPage />
                ) : (
                    <Navigate to="/super-admin" replace />
                )}
            </RequireAuth>
        ),
    },
    {
        path: "/super-admin",
        element: (
            <RequireAuth>
                {Number(getStoredSession()?.user?.role_id) === 1 ? (
                    <SuperAdminDashboardPage />
                ) : (
                    <Navigate to="/admin" replace />
                )}
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