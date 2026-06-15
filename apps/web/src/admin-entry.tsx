import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AdminPanel from "./AdminPanel";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminPanel onExit={() => { window.location.href = "/"; }} />
  </StrictMode>,
);
