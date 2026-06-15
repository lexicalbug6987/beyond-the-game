import { useState } from "react";
import HostApp from "./HostApp";
import PlayerApp from "./PlayerApp";

function joinCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("s");
  return code ? code.toUpperCase() : null;
}

export default function App() {
  const [joinCode] = useState(joinCodeFromUrl);

  // A QR/URL with ?s=CODE drops teammates straight into the player flow.
  if (joinCode) return <PlayerApp code={joinCode} />;

  // Everyone else lands directly in Beyond the Game (host flow).
  return <HostApp />;
}
