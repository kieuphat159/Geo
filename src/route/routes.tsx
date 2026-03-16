import HospitalDashboardPage from "../pages/HospitalDashboardPage";
import UserPage from "../pages/UserPage";
import { Navigate} from "react-router-dom";

export const routes = [
    {
        path: "/",
        element: <Navigate to="/user" replace />
    },
    {
        path: "/user",
        element: <UserPage />
    },
    {
        path: "/hospital",
        element: <HospitalDashboardPage />
    }
]