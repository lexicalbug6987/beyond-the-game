import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createSession, getResults, getSession, type TeamResults } from "./api";
import { TeamResultsView } from "./TeamResults";

type Phase = "setup" | "lobby" | "results";

export default function HostApp() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
          <p className="eyebrow">Beyond the Game</p>
          <h1>How does your team actually show up?</h1>
          <p className="lede">
            Create a session, put the QR code on a screen, and everyone answers anonymously on their
            own phone — how they'd respond and what usually happens on the team. You'll get one
            shared read on your culture, including where you agree and where to grow.
          </p>
        </header>
        <section className="panel">
          <label className="field-label" htmlFor="teamName">
            Team name
          </label>
          <input
            id="teamName"
            className="text-input"
            placeholder="e.g. Varsity Volleyball"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            maxLength={60}
          />
          {error && <p className="error-text">{error}</p>}
          <button className="primary block" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "Create session"}
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
          ← New session
        </button>
        <p className="eyebrow">{teamName}</p>
        <h1>Scan to join</h1>
        <p className="lede">Everyone scans this, answers on their phone, and it stays anonymous.</p>
      </header>

      <section className="panel join-panel">
        <canvas ref={canvasRef} className="qr-canvas" />
        <div className="join-meta">
          <p className="muted small">Or go to this address and enter the code:</p>
          <p className="join-url">{joinUrl.replace(/^https?:\/\//, "")}</p>
          <div className="join-code">{code}</div>
        </div>
      </section>

      <section className="panel lobby-count">
        <div className="count-badge">{count}</div>
        <div>
          <strong>{count === 1 ? "1 teammate" : `${count} teammates`} finished</strong>
          <p className="muted small">Updates live as people complete it.</p>
        </div>
      </section>

      <div className="footer-actions">
        <button className="primary" onClick={onReveal} disabled={count === 0}>
          Reveal team results
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
          <h1>Couldn't load results</h1>
          <p className="lede">{error}</p>
        </header>
        <div className="footer-actions">
          <button className="primary" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="app narrow">
        <header className="hero">
          <h1>Loading…</h1>
        </header>
      </div>
    );
  }

  return (
    <div className="app narrow">
      <header className="hero">
        <button className="link-back" onClick={onBack}>
          ← Back to lobby
        </button>
        <p className="eyebrow">
          {teamName} · {results.participantCount}{" "}
          {results.participantCount === 1 ? "response" : "responses"} · {results.overallScore}/100
        </p>
        <h1>Who your team actually is</h1>
        <p className="lede">{results.headline}</p>
      </header>

      <TeamResultsView results={results} />

      <div className="footer-actions">
        <button className="primary" onClick={refresh}>
          Refresh
        </button>
        <button className="ghost" onClick={onExit}>
          New session
        </button>
      </div>
    </div>
  );
}
