import { useEffect, useMemo, useState } from "react";
import type { QuizConfig, QuizPerspective, QuizQuestion } from "@team-culture-sim/sim-engine";
import { quizConfig as bundledQuizConfig, useQuizStore } from "./store/quizStore";
import { useContentStore } from "./content";
import { getQuiz, saveContent, updateQuiz, type ContentPage } from "./api";
import { cloneQuizConfig, formatImpacts, parseImpacts } from "./quizAdminUtils";
import { withQuizCopy } from "./quizCopy";
import { clearAdminToken, getAdminToken } from "./adminAuth";

type Tab = "content" | "questions";
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
  const [tab, setTab] = useState<Tab>("content");

  return (
    <div className="app admin-app">
      <header className="hero">
        <button className="link-back" onClick={onExit}>
          ← Back to host
        </button>
        <p className="eyebrow">Beyond the Game · Admin</p>
        <h1>{tab === "content" ? "Page content" : "Question bank"}</h1>
        <p className="lede">
          {tab === "content"
            ? "Edit the words people see on every screen, organized page by page."
            : "Edit the questions and scoring players see during a session."}
        </p>
      </header>

      <div className="admin-tabs">
        <button
          className={tab === "content" ? "admin-tab active" : "admin-tab"}
          onClick={() => setTab("content")}
        >
          Page content
        </button>
        <button
          className={tab === "questions" ? "admin-tab active" : "admin-tab"}
          onClick={() => setTab("questions")}
        >
          Question bank
        </button>
      </div>

      {tab === "content" ? <ContentEditor /> : <QuestionBank />}
    </div>
  );
}

function ContentEditor() {
  const pages = useContentStore((s) => s.pages);
  const setMerged = useContentStore((s) => s.setMerged);

  // Sparse draft of only the fields the admin has actually edited, keyed by
  // page → field. Untouched fields fall back to the live store value, so a
  // background refresh never clobbers their edits or shows stale values.
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const valueOf = (pageKey: string, fieldKey: string, fallback: string) =>
    draft[pageKey]?.[fieldKey] ?? fallback;

  const dirty = useMemo(
    () =>
      pages.some((page) =>
        page.fields.some(
          (field) => draft[page.key]?.[field.key] !== undefined &&
            draft[page.key][field.key] !== field.value,
        ),
      ),
    [pages, draft],
  );

  function update(pageKey: string, fieldKey: string, value: string) {
    setStatus("idle");
    setDraft((prev) => ({ ...prev, [pageKey]: { ...prev[pageKey], [fieldKey]: value } }));
  }

  async function handleSave() {
    setStatus("saving");
    setError("");
    const payload: ContentPage[] = pages.map((page) => ({
      ...page,
      fields: page.fields.map((field) => ({
        ...field,
        value: valueOf(page.key, field.key, field.value),
      })),
    }));
    try {
      const res = await saveContent(payload, getAdminToken());
      setMerged(res.pages);
      setDraft({});
      setStatus("saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      // An expired/invalid token means we must re-authenticate from scratch.
      if (/unauthorized|401/i.test(message)) {
        clearAdminToken();
        window.location.reload();
        return;
      }
      setError(message);
      setStatus("error");
    }
  }

  return (
    <>
      <div className="content-pages">
        {pages.map((page) => (
          <section key={page.key} className="panel content-page">
            <div className="content-page-head">
              <h2>{page.title}</h2>
              {page.description && <p className="muted small">{page.description}</p>}
            </div>
            <div className="content-fields">
              {page.fields.map((field) => {
                const id = `${page.key}-${field.key}`;
                const value = valueOf(page.key, field.key, field.value);
                return (
                  <div key={field.key} className="content-field">
                    <label className="field-label" htmlFor={id}>
                      {field.label}
                    </label>
                    {field.multiline ? (
                      <textarea
                        id={id}
                        className="text-input content-textarea"
                        value={value}
                        rows={3}
                        maxLength={2000}
                        onChange={(e) => update(page.key, field.key, e.target.value)}
                      />
                    ) : (
                      <input
                        id={id}
                        className="text-input"
                        value={value}
                        maxLength={2000}
                        onChange={(e) => update(page.key, field.key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="content-save-bar">
        {status === "saved" && <span className="content-save-msg saved">Saved</span>}
        {status === "error" && <span className="content-save-msg error">{error}</span>}
        <button className="primary" onClick={handleSave} disabled={status === "saving" || !dirty}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>
    </>
  );
}

function QuestionBank() {
  const loadConfig = useQuizStore((s) => s.loadConfig);
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
        const merged = withQuizCopy(config);
        setDraft(cloneQuizConfig(merged));
        setSaved(cloneQuizConfig(merged));
        loadConfig(merged);
      })
      .catch(() => {
        const fallback = cloneQuizConfig(bundledQuizConfig);
        setDraft(fallback);
        setSaved(fallback);
        setError("Couldn't reach the API — edits won't save until you run npm run dev (web + server).");
      })
      .finally(() => setLoading(false));
  }, [loadConfig]);

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
      <section className="panel">
        <h2>Loading question bank…</h2>
      </section>
    );
  }

  const selfCount = draft.questions.filter((q) => q.perspective === "self").length;
  const teamCount = draft.questions.filter((q) => q.perspective === "team").length;

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const next = await updateQuiz(draft, getAdminToken());
      const savedCopy = withQuizCopy(cloneQuizConfig(next));
      setDraft(savedCopy);
      setSaved(savedCopy);
      loadConfig(savedCopy);
      setStatus("Saved. Host and player screens will show these updates.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      // An expired/invalid token means we must re-authenticate from scratch.
      if (/unauthorized|401/i.test(message)) {
        clearAdminToken();
        window.location.reload();
        return;
      }
      setError(message);
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
    <>
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
                        current
                          ? updateQuestion(current, question.id, { theme: e.target.value })
                          : current,
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
                      current
                        ? updateQuestion(current, question.id, { prompt: e.target.value })
                        : current,
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
    </>
  );
}
