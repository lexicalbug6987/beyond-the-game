import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import BeyondTheGameHost from "./BeyondTheGameHost";
import PlayerApp from "./PlayerApp";
import "./styles.css";

function joinCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("s");
  return code ? code.toUpperCase() : null;
}

function BeyondTheGameRoot() {
  const [joinCode] = useState(joinCodeFromUrl);
  if (joinCode) return <PlayerApp code={joinCode} />;
  return <BeyondTheGameHost />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BeyondTheGameRoot />
  </StrictMode>,
);
