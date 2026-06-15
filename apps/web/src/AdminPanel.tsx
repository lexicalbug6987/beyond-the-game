import { useMemo, useState } from "react";
import type { QuizPerspective, TeamValue } from "@team-culture-sim/sim-engine";
import { quizConfig } from "./store/quizStore";

type Filter = "all" | QuizPerspective;

function perspectiveLabel(perspective: QuizPerspective): string {
  return perspective === "team" ? "About your team" : "About you";
}

function formatImpacts(impacts: Partial<Record<TeamValue, number>>): string {
  return Object.entries(impacts)
    .map(([value, delta]) => `${value} ${delta > 0 ? "+" : ""}${delta}`)
    .join(", ");
}

export default function AdminPanel({ onExit }: { onExit: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");

  const questions = useMemo(() => {
    if (filter === "all") return quizConfig.questions;
    return quizConfig.questions.filter((q) => q.perspective === filter);
  }, [filter]);

  const selfCount = quizConfig.questions.filter((q) => q.perspective === "self").length;
  const teamCount = quizConfig.questions.filter((q) => q.perspective === "team").length;

  return (
    <div className="app admin-app">
      <header className="hero">
        <button className="link-back" onClick={onExit}>
          ← Back to host
        </button>
        <p className="eyebrow">Beyond the Game · Admin</p>
        <h1>Question bank</h1>
        <p className="lede">
          Everything players see during a session — {quizConfig.questions.length} questions total (
          {selfCount} personal, {teamCount} about the team).
        </p>
      </header>

      <section className="panel admin-summary">
        <h2>Values scored</h2>
        <ul className="admin-value-list">
          {quizConfig.values.map((v) => (
            <li key={v.id}>
              <strong>{v.label}</strong>
              <span>{v.blurb}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="admin-filters">
        <span className="admin-filter-label">Show</span>
        {(
          [
            ["all", `All (${quizConfig.questions.length})`],
            ["self", `About you (${selfCount})`],
            ["team", `About your team (${teamCount})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "admin-filter active" : "admin-filter"}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-questions">
        {questions.map((question) => {
          const number = quizConfig.questions.findIndex((q) => q.id === question.id) + 1;
          return (
          <article key={question.id} className="panel admin-question">
            <div className="admin-question-head">
              <span className="admin-qnum">Q{number}</span>
              <span className={`perspective-pill ${question.perspective}`}>
                {perspectiveLabel(question.perspective)}
              </span>
              <span className="admin-theme">{question.theme}</span>
              <span className="admin-id">{question.id}</span>
            </div>
            <h2 className="admin-prompt">{question.prompt}</h2>
            <ol className="admin-options">
              {question.options.map((opt) => (
                <li key={opt.id} className="admin-option">
                  <p className="admin-option-label">
                    <span className="admin-option-id">{opt.id.toUpperCase()}.</span> {opt.label}
                  </p>
                  {Object.keys(opt.valueImpacts).length > 0 && (
                    <p className="admin-impacts">{formatImpacts(opt.valueImpacts)}</p>
                  )}
                  {opt.insight && <p className="admin-insight">{opt.insight}</p>}
                </li>
              ))}
            </ol>
          </article>
          );
        })}
      </div>
    </div>
  );
}
