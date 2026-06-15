import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AdminPanel from "./AdminPanel";
import AdminGate from "./AdminGate";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminGate>
      <AdminPanel onExit={() => { window.location.href = "/"; }} />
    </AdminGate>
  </StrictMode>,
);
