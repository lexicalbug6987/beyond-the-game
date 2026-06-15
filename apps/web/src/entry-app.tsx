import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminPanel from "./AdminPanel";
import BeyondTheGameHost from "./BeyondTheGameHost";
import HostChrome from "./HostChrome";
import PlayerApp from "./PlayerApp";
import "./styles.css";

function joinCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("s");
  return code ? code.toUpperCase() : null;
}

function adminFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get("admin") === "1";
}

function BeyondTheGameRoot() {
  const [joinCode] = useState(joinCodeFromUrl);
  const [admin] = useState(adminFromUrl);

  if (joinCode) return <PlayerApp code={joinCode} />;
  if (admin) return <AdminPanel onExit={() => { window.location.href = "/"; }} />;
  return (
    <HostChrome>
      <BeyondTheGameHost />
    </HostChrome>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BeyondTheGameRoot />
  </StrictMode>,
);
