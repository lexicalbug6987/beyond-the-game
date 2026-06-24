import { useEffect, useMemo, useRef, useState } from "react";
import type { QuizConfig, QuizPerspective, QuizQuestion } from "@team-culture-sim/sim-engine";
import { quizConfig as bundledQuizConfig, useQuizStore } from "./store/quizStore";
import { useContentStore, notifyContentUpdated } from "./content";
import { getQuiz, getHealth, saveContent, updateQuiz, type ContentPage, type HealthInfo } from "./api";
import { cloneQuizConfig, createBlankQuestion, formatImpacts, parseImpacts } from "./quizAdminUtils";
import { withQuizCopy } from "./quizCopy";
import { clearAdminToken, getAdminToken } from "./adminAuth";

type Tab = "content" | "questions";
type Filter = "all" | QuizPerspective;

type ContentNavGroup = "host" | "player" | "quiz";

const CONTENT_NAV_GROUPS: { id: ContentNavGroup; label: string }[] = [
  { id: "host", label: "Host screens" },
  { id: "player", label: "Player screens" },
  { id: "quiz", label: "Quiz UI" },
];

function contentNavGroup(pageKey: string): ContentNavGroup {
  if (pageKey.startsWith("host")) return "host";
  if (pageKey.startsWith("player")) return "player";
  return "quiz";
}

function contentNavLabel(title: string): string {
  const parts = title.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : title;
}

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

function addQuestion(config: QuizConfig, perspective: QuizPerspective): QuizConfig {
  const question = createBlankQuestion(config.questions, perspective);
  return { ...config, questions: [...config.questions, question] };
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
    <div className={`app admin-app${tab === "content" ? " admin-app-wide" : ""}`}>
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
      <StorageStatus />
    </div>
  );
}

function StorageStatus() {
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  if (!health || health.persistent) return null;

  return (
    <section className="panel admin-storage-warning">
      <strong>Changes won&apos;t survive redeploys</strong>
      <p className="muted small">
        Storage is temporary ({health.storage}). In Replit, open{" "}
        <strong>Database</strong>, create PostgreSQL, and redeploy so{" "}
        <code>DATABASE_URL</code> is set. Then check{" "}
        <code>/api/health</code> shows <code>&quot;storage&quot;: &quot;postgres&quot;</code>.
      </p>
    </section>
  );
}

function ContentEditor() {
  const pages = useContentStore((s) => s.pages);
  const setMerged = useContentStore((s) => s.setMerged);

  const [activePageKey, setActivePageKey] = useState(pages[0]?.key ?? "");
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (pages.length > 0 && !pages.some((page) => page.key === activePageKey)) {
      setActivePageKey(pages[0].key);
    }
  }, [pages, activePageKey]);

  const activePage = pages.find((page) => page.key === activePageKey) ?? pages[0];

  const valueOf = (pageKey: string, fieldKey: string, fallback: string) =>
    draft[pageKey]?.[fieldKey] ?? fallback;

  const pageIsDirty = (page: ContentPage) =>
    page.fields.some(
      (field) =>
        draft[page.key]?.[field.key] !== undefined &&
        draft[page.key][field.key] !== field.value,
    );

  const dirty = useMemo(() => pages.some(pageIsDirty), [pages, draft]);

  function update(pageKey: string, fieldKey: string, value: string) {
    setStatus("idle");
    setDraft((prev) => ({ ...prev, [pageKey]: { ...prev[pageKey], [fieldKey]: value } }));
  }

  async function handleSave() {
    setStatus("saving");
    setError("");
    setNotice("");
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
      notifyContentUpdated();
      setStatus("saved");
      setNotice(
        res.persistent
          ? ""
          : "Saved for now — connect a Replit database or changes will be lost on redeploy.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      if (/unauthorized|401/i.test(message)) {
        clearAdminToken();
        window.location.reload();
        return;
      }
      setError(message);
      setStatus("error");
    }
  }

  if (!activePage) {
    return (
      <section className="panel">
        <h2>Loading page content…</h2>
      </section>
    );
  }

  return (
    <div className="content-editor-layout">
      <nav className="content-nav" aria-label="Page sections">
        {CONTENT_NAV_GROUPS.map((group) => {
          const groupPages = pages.filter((page) => contentNavGroup(page.key) === group.id);
          if (groupPages.length === 0) return null;
          return (
            <div key={group.id} className="content-nav-group">
              <p className="content-nav-heading">{group.label}</p>
              <ul className="content-nav-list">
                {groupPages.map((page) => (
                  <li key={page.key}>
                    <button
                      type="button"
                      className={
                        page.key === activePage.key
                          ? "content-nav-item active"
                          : "content-nav-item"
                      }
                      onClick={() => setActivePageKey(page.key)}
                    >
                      <span className="content-nav-item-label">{contentNavLabel(page.title)}</span>
                      {pageIsDirty(page) && (
                        <span className="content-nav-dot" aria-label="Unsaved changes" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="content-editor-main">
        <section className="panel content-page">
          <div className="content-page-head">
            <h2>{activePage.title}</h2>
            {activePage.description && <p className="muted small">{activePage.description}</p>}
          </div>
          <div className="content-fields">
            {activePage.fields.map((field) => {
              const id = `${activePage.key}-${field.key}`;
              const value = valueOf(activePage.key, field.key, field.value);
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
                      onChange={(e) => update(activePage.key, field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      id={id}
                      className="text-input"
                      value={value}
                      maxLength={2000}
                      onChange={(e) => update(activePage.key, field.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="content-save-bar">
          {status === "saved" && <span className="content-save-msg saved">Saved</span>}
          {status === "error" && <span className="content-save-msg error">{error}</span>}
          {notice && <span className="content-save-msg muted">{notice}</span>}
          {dirty && status === "idle" && (
            <span className="content-save-msg muted">Unsaved changes</span>
          )}
          <button className="primary" onClick={handleSave} disabled={status === "saving" || !dirty}>
            {status === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
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
  const scrollToQuestionId = useRef<string | null>(null);

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

  useEffect(() => {
    const id = scrollToQuestionId.current;
    if (!id) return;
    scrollToQuestionId.current = null;
    document.getElementById(`admin-question-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [draft?.questions.length]);

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
      setStatus("Saved. Host and player screens will show these updates when you go back.");
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

  function handleAddQuestion() {
    const perspective: QuizPerspective = filter === "team" || filter === "self" ? filter : "self";
    setDraft((current) => {
      if (!current) return current;
      const next = addQuestion(current, perspective);
      const added = next.questions[next.questions.length - 1];
      scrollToQuestionId.current = added.id;
      return next;
    });
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
        <button type="button" className="admin-add-question" onClick={handleAddQuestion}>
          + Add question
        </button>
      </div>

      <div className="admin-questions">
        {questions.map((question) => {
          const number = draft.questions.findIndex((q) => q.id === question.id) + 1;
          return (
            <article
              key={question.id}
              id={`admin-question-${question.id}`}
              className="panel admin-question admin-question-edit"
            >
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
