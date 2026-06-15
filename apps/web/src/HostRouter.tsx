import { useState } from "react";
import BeyondTheGameHost from "./BeyondTheGameHost";
import PlayerApp from "./PlayerApp";

function joinCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("s");
  return code ? code.toUpperCase() : null;
}

/** Beyond the Game — team session host flow only. */
export default function HostRouter() {
  const [joinCode] = useState(joinCodeFromUrl);

  if (joinCode) return <PlayerApp code={joinCode} />;

  return <BeyondTheGameHost />;
}
