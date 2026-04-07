import { initMockBackend } from "./mocks/mockBackend";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";
import "leaflet/dist/leaflet.css";

if (import.meta.env.VITE_USE_MOCK === "true") {
    initMockBackend();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
);
