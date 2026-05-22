import { Route, Routes } from "react-router-dom";
import { SosReconcileProvider } from "./context/SosReconcileContext";
import { routes } from "./route/routes";

export default function App() {
  return (
    <SosReconcileProvider>
      <Routes>
          {routes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
          ))}
      </Routes>
    </SosReconcileProvider>
  );
}
