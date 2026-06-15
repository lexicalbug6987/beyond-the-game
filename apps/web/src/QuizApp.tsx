import { useEffect, useRef, useState } from "react";
import { TIER_LABEL, type QuizGrowthArea, type ValueLevel } from "@team-culture-sim/sim-engine";
import { useQuizResult, useQuizStore } from "./store/quizStore";
import { submitAnswers } from "./api";
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
        <div className="quiz-tags">
          <span className={`perspective-pill ${question.perspective}`}>
            {question.perspective === "team" ? c("quiz", "teamTag") : c("quiz", "selfTag")}
          </span>
          <span className="eyebrow inline">
            {question.theme} · {index + 1} {c("quiz", "progressOf")} {total}
          </span>
        </div>
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
        <p className="muted small">
          {question.perspective === "team" ? c("quiz", "teamHint") : c("quiz", "selfHint")}
        </p>
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

  const topStrength = result.strengths[0]?.label;
  const topGrowth = result.growthAreas[0]?.label;

  return (
    <div className="app narrow">
      <header className="hero">
        <p className="eyebrow">{team.teamName}</p>
        <h1>{status === "submitting" ? c("playerSubmit", "sendingTitle") : c("playerSubmit", "doneTitle")}</h1>
        <p className="lede">
          {c("playerSubmit", "anonymousPrefix")} {team.teamName}
          {c("playerSubmit", "anonymousSuffix")}
          {count > 0
            ? ` — ${count} ${count === 1 ? c("playerSubmit", "finishedSingular") : c("playerSubmit", "finishedPlural")}`
            : "."}
        </p>
      </header>

      {status === "done" && (topStrength || topGrowth) && (
        <section className="panel">
          <h2>{c("playerSubmit", "justForYouHeading")}</h2>
          <p className="muted">{c("playerSubmit", "justForYouHint")}</p>
          <ul className="pulse">
            {topStrength && (
              <li>
                <span>{c("playerSubmit", "leanOnLabel")}</span>
                <strong>{topStrength}</strong>
              </li>
            )}
            {topGrowth && (
              <li>
                <span>{c("playerSubmit", "growLabel")}</span>
                <strong>{topGrowth}</strong>
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="panel">
        <p className="muted">{c("playerSubmit", "waitingNote")}</p>
      </section>

      <div className="footer-actions">
        <button className="ghost" onClick={onExit}>
          {c("playerSubmit", "doneButton")}
        </button>
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
