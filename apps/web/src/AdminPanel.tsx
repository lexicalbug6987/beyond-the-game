import { useMemo, useState } from "react";
import type { QuizPerspective, TeamValue } from "@team-culture-sim/sim-engine";
import { quizConfig } from "./store/quizStore";
import { useContentStore } from "./content";
import { saveContent, type ContentPage } from "./api";
import { clearAdminToken, getAdminToken } from "./adminAuth";

type Tab = "content" | "questions";
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
            : `Everything players see during a session — ${quizConfig.questions.length} questions total.`}
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
  const [filter, setFilter] = useState<Filter>("all");

  const questions = useMemo(() => {
    if (filter === "all") return quizConfig.questions;
    return quizConfig.questions.filter((q) => q.perspective === filter);
  }, [filter]);

  const selfCount = quizConfig.questions.filter((q) => q.perspective === "self").length;
  const teamCount = quizConfig.questions.filter((q) => q.perspective === "team").length;

  return (
    <>
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
    </>
  );
}
