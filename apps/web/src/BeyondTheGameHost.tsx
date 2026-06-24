import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createSession, getResults, getSession, type TeamResults } from "./api";
import { TeamResultsView } from "./TeamResults";
import { useContent } from "./content";
import { useQuizConfigLoader } from "./useQuizConfigLoader";

type Phase = "setup" | "lobby" | "results";

export default function BeyondTheGameHost() {
  const c = useContent();
  const [phase, setPhase] = useState<Phase>("setup");
  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useQuizConfigLoader();

  const joinUrl = code ? `${window.location.origin}/?s=${code}` : "";

  function startOver() {
    setCode("");
    setTeamName("");
    setError("");
    setPhase("setup");
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const session = await createSession(teamName.trim() || "Your team");
      setCode(session.code);
      setTeamName(session.teamName);
      setPhase("lobby");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (phase === "setup") {
    return (
      <div className="app narrow">
        <header className="hero">
          <p className="eyebrow">{c("hostSetup", "eyebrow")}</p>
          <h1>{c("hostSetup", "title")}</h1>
          <p className="lede">{c("hostSetup", "lede")}</p>
        </header>
        <section className="panel">
          <label className="field-label" htmlFor="teamName">
            {c("hostSetup", "teamNameLabel")}
          </label>
          <input
            id="teamName"
            className="text-input"
            placeholder={c("hostSetup", "teamNamePlaceholder")}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            maxLength={60}
          />
          {error && <p className="error-text">{error}</p>}
          <button className="primary block" onClick={handleCreate} disabled={creating}>
            {creating ? c("hostSetup", "creatingButton") : c("hostSetup", "createButton")}
          </button>
        </section>
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <Lobby
        code={code}
        teamName={teamName}
        joinUrl={joinUrl}
        onReveal={() => setPhase("results")}
        onExit={startOver}
      />
    );
  }

  return <Results code={code} teamName={teamName} onBack={() => setPhase("lobby")} onExit={startOver} />;
}

function Lobby({
  code,
  teamName,
  joinUrl,
  onReveal,
  onExit,
}: {
  code: string;
  teamName: string;
  joinUrl: string;
  onReveal: () => void;
  onExit: () => void;
}) {
  const c = useContent();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, joinUrl, { width: 220, margin: 1 }, () => {});
    }
  }, [joinUrl]);

  // Poll the live participant count.
  useEffect(() => {
    let active = true;
    const tick = () => {
      getSession(code)
        .then((s) => active && setCount(s.participantCount))
        .catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [code]);

  return (
    <div className="app narrow">
      <header className="hero">
        <button className="link-back" onClick={onExit}>
          ← {c("hostLobby", "backButton")}
        </button>
        <p className="eyebrow">{teamName}</p>
        <h1>{c("hostLobby", "title")}</h1>
        <p className="lede">{c("hostLobby", "lede")}</p>
      </header>

      <section className="panel join-panel">
        <canvas ref={canvasRef} className="qr-canvas" />
        <div className="join-meta">
          <p className="muted small">{c("hostLobby", "addressHint")}</p>
          <p className="join-url">{joinUrl.replace(/^https?:\/\//, "")}</p>
          <div className="join-code">{code}</div>
        </div>
      </section>

      <section className="panel lobby-count">
        <div className="count-badge">{count}</div>
        <div>
          <strong>
            {count === 1 ? c("hostLobby", "countOne") : `${count} ${c("hostLobby", "countMany")}`}{" "}
            {c("hostLobby", "finishedLabel")}
          </strong>
          <p className="muted small">{c("hostLobby", "liveHint")}</p>
        </div>
      </section>

      <div className="footer-actions">
        <button className="primary" onClick={onReveal} disabled={count === 0}>
          {c("hostLobby", "revealButton")}
        </button>
      </div>
    </div>
  );
}

function Results({
  code,
  teamName,
  onBack,
  onExit,
}: {
  code: string;
  teamName: string;
  onBack: () => void;
  onExit: () => void;
}) {
  const c = useContent();
  const [results, setResults] = useState<TeamResults | null>(null);
  const [error, setError] = useState("");

  const refresh = () => {
    getResults(code)
      .then(setResults)
      .catch((err: Error) => setError(err.message));
  };

  useEffect(refresh, [code]);

  if (error) {
    return (
      <div className="app narrow">
        <header className="hero">
          <h1>{c("hostResults", "loadErrorTitle")}</h1>
          <p className="lede">{error}</p>
        </header>
        <div className="footer-actions">
          <button className="primary" onClick={refresh}>
            {c("hostResults", "retryButton")}
          </button>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="app narrow">
        <header className="hero">
          <h1>{c("hostResults", "loadingTitle")}</h1>
        </header>
      </div>
    );
  }

  return (
    <div className="app narrow">
      <header className="hero">
        <button className="link-back" onClick={onBack}>
          ← {c("hostResults", "backButton")}
        </button>
        <p className="eyebrow">
          {teamName} · {results.participantCount}{" "}
          {results.participantCount === 1
            ? c("hostResults", "responseSingular")
            : c("hostResults", "responsePlural")}{" "}
          · {results.overallScore}/100
        </p>
        <h1>{c("hostResults", "title")}</h1>
        <p className="lede">{results.headline}</p>
      </header>

      <TeamResultsView results={results} />

      <div className="footer-actions">
        <button className="primary" onClick={refresh}>
          {c("hostResults", "refreshButton")}
        </button>
        <button className="ghost" onClick={onExit}>
          {c("hostResults", "newSessionButton")}
        </button>
      </div>
    </div>
  );
}
