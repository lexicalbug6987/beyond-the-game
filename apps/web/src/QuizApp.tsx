import { useEffect, useRef, useState } from "react";
import {
  TIER_LABEL,
  type QuizGrowthArea,
  type QuizResult,
  type ValueLevel,
} from "@team-culture-sim/sim-engine";
import { useQuizResult, useQuizStore } from "./store/quizStore";
import { getResults, submitAnswers, type TeamResults } from "./api";
import { useContent } from "./content";

interface TeamContext {
  code: string;
  teamName: string;
}

export default function QuizApp({
  onExit,
  team,
}: {
  onExit: () => void;
  team?: TeamContext;
}) {
  const finished = useQuizStore((s) => s.finished);

  if (finished) {
    return team ? <TeamSubmit team={team} onExit={onExit} /> : <QuizResults onExit={onExit} />;
  }
  return <QuizQuestionScreen onExit={onExit} team={team} />;
}

function QuizQuestionScreen({ onExit, team }: { onExit: () => void; team?: TeamContext }) {
  const c = useContent();
  const config = useQuizStore((s) => s.config);
  const index = useQuizStore((s) => s.index);
  const answers = useQuizStore((s) => s.answers);
  const answer = useQuizStore((s) => s.answer);
  const back = useQuizStore((s) => s.back);

  const question = config.questions[index];
  const total = config.questions.length;
  const selected = answers[question.id];
  const progress = Math.round((index / total) * 100);

  return (
    <div className="app narrow">
      <header className="hero">
        <button className="link-back" onClick={index === 0 ? onExit : back}>
          ←{" "}
          {index === 0
            ? team
              ? c("quiz", "leaveButton")
              : c("quiz", "homeButton")
            : c("quiz", "backButton")}
        </button>
        <p className="eyebrow">
          {index + 1} {c("quiz", "progressOf")} {total}
        </p>
        <h1 className="quiz-prompt">{question.prompt}</h1>
      </header>

      <div className="quiz-progress">
        <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <section className="panel">
        <div className="quiz-options">
          {question.options.map((opt) => (
            <button
              key={opt.id}
              className={selected === opt.id ? "quiz-option selected" : "quiz-option"}
              onClick={() => answer(question.id, opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamSubmit({ team, onExit }: { team: TeamContext; onExit: () => void }) {
  const c = useContent();
  const answers = useQuizStore((s) => s.answers);
  const result = useQuizResult();
  const [status, setStatus] = useState<"submitting" | "done" | "error">("submitting");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const submittedRef = useRef(false);

  useEffect(() => {
    // Guard against StrictMode's double-invoke so we POST exactly once.
    if (submittedRef.current) return;
    submittedRef.current = true;
    setStatus("submitting");
    submitAnswers(team.code, answers)
      .then((res) => {
        setCount(res.participantCount);
        setStatus("done");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus("error");
        submittedRef.current = false; // allow a retry
      });
  }, [team.code, answers, attempt]);

  if (status === "error") {
    return (
      <div className="app narrow">
        <header className="hero">
          <h1>{c("playerSubmit", "errorTitle")}</h1>
          <p className="lede">{error}</p>
        </header>
        <div className="footer-actions">
          <button className="primary" onClick={() => setAttempt((a) => a + 1)}>
            {c("playerSubmit", "errorRetryButton")}
          </button>
        </div>
      </div>
    );
  }

  if (status === "submitting") {
    return (
      <div className="app narrow">
        <header className="hero">
          <p className="eyebrow">{team.teamName}</p>
          <h1>{c("playerSubmit", "sendingTitle")}</h1>
          <p className="lede">
            {c("playerSubmit", "anonymousPrefix")} {team.teamName}
            {c("playerSubmit", "anonymousSuffix")}.
          </p>
        </header>
      </div>
    );
  }

  return <TeamMemberResults team={team} result={result} count={count} onExit={onExit} />;
}

function TeamMemberResults({
  team,
  result,
  count,
  onExit,
}: {
  team: TeamContext;
  result: QuizResult;
  count: number;
  onExit: () => void;
}) {
  const c = useContent();
  const [teamScores, setTeamScores] = useState<Map<string, number> | null>(null);
  const [teamCount, setTeamCount] = useState(count);

  // Pull the team's pooled scores and keep them fresh as more people finish, so
  // each participant first sees their own bars, then the team marker appears.
  useEffect(() => {
    let active = true;
    const tick = () => {
      getResults(team.code)
        .then((r: TeamResults) => {
          if (!active) return;
          const map = new Map<string, number>();
          for (const lvl of r.levels) map.set(lvl.value, lvl.score);
          setTeamScores(map);
          setTeamCount(r.participantCount);
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [team.code]);

  const ordered = [...result.levels].sort((a, b) => {
    if (a.tier === "untested" && b.tier !== "untested") return 1;
    if (b.tier === "untested" && a.tier !== "untested") return -1;
    return b.score - a.score;
  });

  return (
    <div className="app narrow">
      <header className="hero">
        <p className="eyebrow">{team.teamName}</p>
        <h1>{c("playerSubmit", "doneTitle")}</h1>
        <p className="lede">
          {c("playerSubmit", "anonymousPrefix")} {team.teamName}
          {c("playerSubmit", "anonymousSuffix")}
          {teamCount > 0
            ? ` — ${teamCount} ${teamCount === 1 ? c("playerSubmit", "finishedSingular") : c("playerSubmit", "finishedPlural")}`
            : "."}
        </p>
      </header>

      <section className="panel">
        <h2>Your value scores</h2>
        <p className="muted small">
          The bar is where you landed. The line shows your team&apos;s average, so you can
          see where you line up — and where you differ.
        </p>
        <div className="cmp-legend">
          <span className="cmp-legend-item">
            <span className="cmp-legend-bar" /> You
          </span>
          <span className="cmp-legend-item">
            <span className="cmp-legend-line" /> Team average
          </span>
        </div>
        <div className="levels">
          {ordered.map((v) => (
            <ComparisonBar
              key={v.value}
              level={v}
              teamScore={teamScores ? (teamScores.get(v.value) ?? null) : null}
            />
          ))}
        </div>
      </section>

      {result.growthAreas.length > 0 && (
        <section className="panel">
          <h2>Where to focus next</h2>
          <div className="growth-list">
            {result.growthAreas.map((g) => (
              <GrowthCard key={g.value} area={g} />
            ))}
          </div>
        </section>
      )}

      <div className="footer-actions">
        <button className="ghost" onClick={onExit}>
          {c("playerSubmit", "doneButton")}
        </button>
      </div>
    </div>
  );
}

function ComparisonBar({ level, teamScore }: { level: ValueLevel; teamScore: number | null }) {
  const untested = level.tier === "untested";
  const you = untested ? 0 : level.score;
  const hasTeam = teamScore != null && !untested;
  const delta = hasTeam ? you - teamScore : null;
  const deltaClass = delta == null ? "" : delta > 0 ? "above" : delta < 0 ? "below" : "even";

  return (
    <div className={`level-row ${level.tier}`}>
      <div className="level-head">
        <span className="level-label">{level.label}</span>
        <span className="level-tier">
          {untested ? TIER_LABEL[level.tier] : `${level.score} · ${TIER_LABEL[level.tier]}`}
        </span>
      </div>
      <div className="cmp-track">
        <div className="level-fill" style={{ width: untested ? "0%" : `${you}%` }} />
        {hasTeam && (
          <div className="cmp-marker" style={{ left: `${Math.max(1, Math.min(99, teamScore))}%` }} />
        )}
      </div>
      <div className="level-foot">
        <span className="level-blurb">{level.blurb}</span>
        {hasTeam && delta != null && (
          <span className={`cmp-delta ${deltaClass}`}>
            Team {teamScore} · {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "even"}
          </span>
        )}
      </div>
    </div>
  );
}

function QuizResults({ onExit }: { onExit: () => void }) {
  const result = useQuizResult();
  const reset = useQuizStore((s) => s.reset);

  const ordered = [...result.levels].sort((a, b) => {
    if (a.tier === "untested" && b.tier !== "untested") return 1;
    if (b.tier === "untested" && a.tier !== "untested") return -1;
    return b.score - a.score;
  });

  return (
    <div className="app narrow">
      <header className="hero">
        <button className="link-back" onClick={onExit}>
          ← Home
        </button>
        <p className="eyebrow">Culture check · {result.overallScore}/100 overall</p>
        <h1>Where your team stands</h1>
        <p className="lede">{result.headline}</p>
      </header>

      <section className="panel">
        <h2>Your value scores</h2>
        <div className="levels">
          {ordered.map((v) => (
            <ScoreBar key={v.value} level={v} />
          ))}
        </div>
      </section>

      {result.growthAreas.length > 0 && (
        <section className="panel">
          <h2>Where to focus next</h2>
          <div className="growth-list">
            {result.growthAreas.map((g) => (
              <GrowthCard key={g.value} area={g} />
            ))}
          </div>
        </section>
      )}

      <div className="footer-actions">
        <button className="primary" onClick={reset}>
          Take it again
        </button>
        <button className="ghost" onClick={onExit}>
          Back to home
        </button>
      </div>
    </div>
  );
}

function ScoreBar({ level }: { level: ValueLevel }) {
  const untested = level.tier === "untested";
  return (
    <div className={`level-row ${level.tier}`}>
      <div className="level-head">
        <span className="level-label">{level.label}</span>
        <span className="level-tier">
          {untested ? TIER_LABEL[level.tier] : `${level.score} · ${TIER_LABEL[level.tier]}`}
        </span>
      </div>
      <div className="level-track">
        <div className="level-fill" style={{ width: untested ? "0%" : `${level.score}%` }} />
      </div>
      <span className="level-blurb">{level.blurb}</span>
    </div>
  );
}

function GrowthCard({ area }: { area: QuizGrowthArea }) {
  return (
    <article className="growth-card">
      <div className="growth-head">
        <strong>{area.label}</strong>
        <span className="growth-score">{area.score}/100</span>
      </div>
      <p>{area.tip}</p>
    </article>
  );
}
