import { useEffect, useMemo, useState } from "react";
import type { QuizConfig, QuizPerspective, QuizQuestion } from "@team-culture-sim/sim-engine";
import { getQuiz, updateQuiz } from "./api";
import { cloneQuizConfig, formatImpacts, parseImpacts } from "./quizAdminUtils";
import { quizConfig as bundledQuizConfig } from "./store/quizStore";

type Filter = "all" | QuizPerspective;

function perspectiveLabel(perspective: QuizPerspective): string {
  return perspective === "team" ? "About your team" : "About you";
}

function updateQuestion(
  config: QuizConfig,
  questionId: string,
  patch: Partial<QuizQuestion>,
): QuizConfig {
  return {
    ...config,
    questions: config.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
  };
}

function updateOption(
  config: QuizConfig,
  questionId: string,
  optionId: string,
  patch: Partial<QuizQuestion["options"][number]>,
): QuizConfig {
  return {
    ...config,
    questions: config.questions.map((q) =>
      q.id !== questionId
        ? q
        : {
            ...q,
            options: q.options.map((opt) => (opt.id === optionId ? { ...opt, ...patch } : opt)),
          },
    ),
  };
}

export default function AdminPanel({ onExit }: { onExit: () => void }) {
  const [draft, setDraft] = useState<QuizConfig | null>(null);
  const [saved, setSaved] = useState<QuizConfig | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getQuiz()
      .then((config) => {
        setDraft(cloneQuizConfig(config));
        setSaved(cloneQuizConfig(config));
      })
      .catch(() => {
        const fallback = cloneQuizConfig(bundledQuizConfig);
        setDraft(fallback);
        setSaved(fallback);
        setError("Couldn't reach the API — showing bundled questions. Start the server to save edits.");
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return JSON.stringify(draft) !== JSON.stringify(saved);
  }, [draft, saved]);

  const questions = useMemo(() => {
    if (!draft) return [];
    if (filter === "all") return draft.questions;
    return draft.questions.filter((q) => q.perspective === filter);
  }, [draft, filter]);

  if (loading || !draft) {
    return (
      <div className="app admin-app narrow">
        <header className="hero">
          <h1>Loading question bank…</h1>
        </header>
      </div>
    );
  }

  const selfCount = draft.questions.filter((q) => q.perspective === "self").length;
  const teamCount = draft.questions.filter((q) => q.perspective === "team").length;

  async function handleSave() {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const next = await updateQuiz(draft);
      const savedCopy = cloneQuizConfig(next);
      setDraft(savedCopy);
      setSaved(savedCopy);
      setStatus("Saved — players will see these questions in new sessions.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!saved) return;
    setDraft(cloneQuizConfig(saved));
    setStatus("");
    setError("");
  }

  return (
    <div className="app admin-app">
      <header className="hero">
        <button className="link-back" onClick={onExit}>
          ← Back to host
        </button>
        <p className="eyebrow">Beyond the Game · Admin</p>
        <h1>Question bank</h1>
        <p className="lede">
          Edit what players see during a session — {draft.questions.length} questions ({selfCount}{" "}
          personal, {teamCount} about the team).
        </p>
      </header>

      <section className="panel admin-save-bar">
        <div>
          <strong>{dirty ? "Unsaved changes" : "All changes saved"}</strong>
          {status && <p className="admin-status ok">{status}</p>}
          {error && <p className="admin-status error">{error}</p>}
        </div>
        <div className="footer-actions">
          <button className="ghost" onClick={handleDiscard} disabled={!dirty || saving}>
            Discard
          </button>
          <button className="primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>

      <div className="admin-filters">
        <span className="admin-filter-label">Show</span>
        {(
          [
            ["all", `All (${draft.questions.length})`],
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
          const number = draft.questions.findIndex((q) => q.id === question.id) + 1;
          return (
            <article key={question.id} className="panel admin-question admin-question-edit">
              <div className="admin-question-head">
                <span className="admin-qnum">Q{number}</span>
                <span className={`perspective-pill ${question.perspective}`}>
                  {perspectiveLabel(question.perspective)}
                </span>
                <span className="admin-id">{question.id}</span>
              </div>

              <div className="admin-field-grid">
                <label className="admin-field">
                  <span className="field-label">Theme</span>
                  <input
                    className="text-input"
                    value={question.theme}
                    onChange={(e) =>
                      setDraft((current) =>
                        current ? updateQuestion(current, question.id, { theme: e.target.value }) : current,
                      )
                    }
                  />
                </label>
                <label className="admin-field">
                  <span className="field-label">Perspective</span>
                  <select
                    className="text-input"
                    value={question.perspective}
                    onChange={(e) =>
                      setDraft((current) =>
                        current
                          ? updateQuestion(current, question.id, {
                              perspective: e.target.value as QuizPerspective,
                            })
                          : current,
                      )
                    }
                  >
                    <option value="self">About you</option>
                    <option value="team">About your team</option>
                  </select>
                </label>
              </div>

              <label className="admin-field">
                <span className="field-label">Question</span>
                <textarea
                  className="text-input admin-textarea"
                  rows={3}
                  value={question.prompt}
                  onChange={(e) =>
                    setDraft((current) =>
                      current ? updateQuestion(current, question.id, { prompt: e.target.value }) : current,
                    )
                  }
                />
              </label>

              <div className="admin-options-edit">
                {question.options.map((opt) => (
                  <div key={opt.id} className="admin-option-edit">
                    <p className="admin-option-id-label">Option {opt.id.toUpperCase()}</p>
                    <label className="admin-field">
                      <span className="field-label">Answer text</span>
                      <textarea
                        className="text-input admin-textarea"
                        rows={2}
                        value={opt.label}
                        onChange={(e) =>
                          setDraft((current) =>
                            current
                              ? updateOption(current, question.id, opt.id, { label: e.target.value })
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="field-label">Value impacts</span>
                      <input
                        className="text-input"
                        value={formatImpacts(opt.valueImpacts)}
                        placeholder="e.g. courage +3, respect -1"
                        onChange={(e) =>
                          setDraft((current) =>
                            current
                              ? updateOption(current, question.id, opt.id, {
                                  valueImpacts: parseImpacts(e.target.value),
                                })
                              : current,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="field-label">Coach insight (optional)</span>
                      <textarea
                        className="text-input admin-textarea"
                        rows={2}
                        value={opt.insight ?? ""}
                        onChange={(e) =>
                          setDraft((current) =>
                            current
                              ? updateOption(current, question.id, opt.id, {
                                  insight: e.target.value || undefined,
                                })
                              : current,
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
