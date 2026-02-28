import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CrashBoundary } from "./components/app/CrashBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </React.StrictMode>
);
