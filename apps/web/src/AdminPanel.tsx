import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  QuizConfig,
  QuizPerspective,
  QuizQuestion,
  TeamValue,
} from "@team-culture-sim/sim-engine";
import { quizConfig as bundledQuizConfig, useQuizStore } from "./store/quizStore";
import { useContentStore, notifyContentUpdated } from "./content";
import { getQuiz, getHealth, saveContent, updateQuiz, type ContentPage, type HealthInfo } from "./api";
import { cloneQuizConfig, createBlankQuestion, formatImpacts, parseImpacts } from "./quizAdminUtils";
import { withQuizCopy } from "./quizCopy";
import { clearAdminToken, getAdminToken } from "./adminAuth";

type Tab = "content" | "questions" | "scoring";
type Filter = "all" | QuizPerspective;

type ContentNavGroup = "host" | "player" | "quiz";

const CONTENT_NAV_GROUPS: { id: ContentNavGroup; label: string }[] = [
  { id: "host", label: "Host screens" },
  { id: "player", label: "Player screens" },
  { id: "quiz", label: "Quiz UI" },
];

const TAB_HEADINGS: Record<Tab, { title: string; lede: string }> = {
  content: {
    title: "Page content",
    lede: "Edit the words people see on every screen, organized page by page.",
  },
  questions: {
    title: "Question bank",
    lede: "Edit the questions and scoring players see during a session.",
  },
  scoring: {
    title: "Scoring sheet",
    lede: "See exactly how each answer maps to your six values — use it as a reference or download a copy.",
  },
};

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

function deleteQuestion(config: QuizConfig, questionId: string): QuizConfig {
  return {
    ...config,
    questions: config.questions.filter((q) => q.id !== questionId),
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
  const heading = TAB_HEADINGS[tab];
  const wide = tab === "content" || tab === "scoring";

  return (
    <div className={`app admin-app${wide ? " admin-app-wide" : ""}`}>
      <header className="hero">
        <button className="link-back" onClick={onExit}>
          ← Back to host
        </button>
        <p className="eyebrow">Beyond the Game · Admin</p>
        <h1>{heading.title}</h1>
        <p className="lede">{heading.lede}</p>
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
        <button
          className={tab === "scoring" ? "admin-tab active" : "admin-tab"}
          onClick={() => setTab("scoring")}
        >
          Scoring sheet
        </button>
      </div>

      {tab === "content" && <ContentEditor />}
      {tab === "questions" && <QuestionBank />}
      {tab === "scoring" && <ScoringSheet />}
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

  function handleDeleteQuestion(questionId: string, prompt: string) {
    if (!draft || draft.questions.length <= 1) {
      setError("You need at least one question in the bank.");
      return;
    }
    const preview = prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt;
    if (!window.confirm(`Delete this question?\n\n“${preview}”`)) return;

    setDraft((current) => (current ? deleteQuestion(current, questionId) : current));
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
                <button
                  type="button"
                  className="admin-delete-question"
                  onClick={() => handleDeleteQuestion(question.id, question.prompt)}
                  disabled={draft.questions.length <= 1}
                  title={draft.questions.length <= 1 ? "At least one question is required" : "Delete question"}
                >
                  Delete
                </button>
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

/** Parse CSV text (handles quoted cells, escaped quotes, CRLF, and a BOM). */
function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // handled on the following \n
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function normalizePerspective(raw: string): QuizPerspective {
  return (raw ?? "").trim().toLowerCase().includes("team") ? "team" : "self";
}

/**
 * Turn parsed CSV rows into new quiz questions. Expects the same columns the
 * scoring sheet exports: Perspective, Theme, Question, Option, Answer, and one
 * column per value (matched by label or id). Consecutive rows that share a
 * question become its answer options.
 */
function csvRowsToQuestions(
  rows: string[][],
  config: QuizConfig,
): { questions: QuizQuestion[]; optionCount: number; valueColumns: number } {
  if (rows.length < 2) {
    throw new Error("That CSV has no data rows under the header.");
  }
  const lower = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => lower.indexOf(name);
  const idxNum = col("#");
  const idxPerspective = col("perspective");
  const idxTheme = col("theme");
  const idxQuestion = col("question");
  const idxOption = col("option");
  const idxAnswer = col("answer");

  if (idxQuestion === -1 || idxAnswer === -1) {
    throw new Error('CSV must include "Question" and "Answer" columns.');
  }

  const valueCols: { index: number; id: TeamValue }[] = [];
  for (const v of config.values) {
    let ci = lower.indexOf(v.label.toLowerCase());
    if (ci === -1) ci = lower.indexOf(v.id.toLowerCase());
    if (ci !== -1) valueCols.push({ index: ci, id: v.id });
  }

  type Group = { key: string; rows: string[][] };
  const groups: Group[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const prompt = (row[idxQuestion] ?? "").trim();
    if (!prompt) continue;
    const num = idxNum !== -1 ? (row[idxNum] ?? "").trim() : "";
    const key = num || prompt;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }

  const usedIds = new Set(config.questions.map((q) => q.id));
  let counter = 1;
  const questions: QuizQuestion[] = [];
  let optionCount = 0;

  for (const group of groups) {
    const first = group.rows[0];
    const prompt = (first[idxQuestion] ?? "").trim();
    const perspective = normalizePerspective(idxPerspective !== -1 ? first[idxPerspective] : "");
    const theme = (idxTheme !== -1 ? (first[idxTheme] ?? "").trim() : "") || "Imported";

    const options = group.rows
      .map((row, oi) => {
        const letter =
          (idxOption !== -1 ? (row[idxOption] ?? "").trim() : "").toLowerCase() ||
          String.fromCharCode(97 + oi);
        const label = (row[idxAnswer] ?? "").trim();
        const valueImpacts: Partial<Record<TeamValue, number>> = {};
        for (const { index, id } of valueCols) {
          const raw = (row[index] ?? "").trim().replace("+", "");
          if (!raw) continue;
          const num = Number(raw);
          if (!Number.isFinite(num) || num === 0) continue;
          valueImpacts[id] = num;
        }
        return { id: letter, label, valueImpacts };
      })
      .filter((opt) => opt.label);

    if (options.length < 2) continue;

    while (usedIds.has(`q-import-${counter}`)) counter++;
    const id = `q-import-${counter}`;
    usedIds.add(id);
    counter++;

    optionCount += options.length;
    questions.push({ id, theme, perspective, prompt, options });
  }

  return { questions, optionCount, valueColumns: valueCols.length };
}

function ScoringSheet() {
  const loadConfig = useQuizStore((s) => s.loadConfig);
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<QuizQuestion[] | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [importErr, setImportErr] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getQuiz()
      .then((c) => setConfig(withQuizCopy(c)))
      .catch(() => {
        setConfig(withQuizCopy(cloneQuizConfig(bundledQuizConfig)));
        setError("Couldn't reach the API — showing the built-in question set.");
      })
      .finally(() => setLoading(false));
  }, []);

  const valueLabels = useMemo(() => {
    const map: Record<string, string> = {};
    config?.values.forEach((v) => {
      map[v.id] = v.label;
    });
    return map;
  }, [config]);

  if (loading || !config) {
    return (
      <section className="panel">
        <h2>Loading scoring sheet…</h2>
      </section>
    );
  }

  function handleDownloadCsv() {
    if (!config) return;
    const header = [
      "#",
      "Perspective",
      "Theme",
      "Question",
      "Option",
      "Answer",
      ...config.values.map((v) => v.label),
    ];
    const rows = config.questions.flatMap((q, i) =>
      q.options.map((opt) => [
        String(i + 1),
        perspectiveLabel(q.perspective),
        q.theme,
        q.prompt,
        opt.id.toUpperCase(),
        opt.label,
        ...config.values.map((v) => {
          const n = opt.valueImpacts[v.id];
          return !n ? "" : n > 0 ? `+${n}` : String(n);
        }),
      ]),
    );
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "beyond-the-game-scoring-sheet.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !config) return;
    setImportErr("");
    setImportMsg("");
    setPending(null);
    try {
      const text = await file.text();
      const { questions, optionCount, valueColumns } = csvRowsToQuestions(
        parseCsv(text),
        config,
      );
      if (questions.length === 0) {
        setImportErr(
          "No complete questions found. Each question needs a prompt and at least two answers.",
        );
        return;
      }
      setPending(questions);
      const noValues =
        valueColumns === 0
          ? " No value columns matched, so these will be imported without scoring."
          : "";
      setImportMsg(
        `Found ${questions.length} question${questions.length === 1 ? "" : "s"} (${optionCount} answers). Review and add them below.${noValues}`,
      );
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : "Couldn't read that CSV.");
    }
  }

  async function handleConfirmImport() {
    if (!config || !pending) return;
    setSaving(true);
    setImportErr("");
    try {
      const next = { ...config, questions: [...config.questions, ...pending] };
      const saved = withQuizCopy(await updateQuiz(next, getAdminToken()));
      setConfig(saved);
      loadConfig(saved);
      const count = pending.length;
      setPending(null);
      setImportMsg(
        `Added ${count} question${count === 1 ? "" : "s"}. They're live in the question bank.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      if (/unauthorized|401/i.test(message)) {
        clearAdminToken();
        window.location.reload();
        return;
      }
      setImportErr(message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelImport() {
    setPending(null);
    setImportMsg("");
    setImportErr("");
  }

  return (
    <>
      <section className="panel scoring-intro">
        <div className="scoring-intro-text">
          <strong>How scoring works</strong>
          <p>
            Each answer can reinforce a value (positive points), undermine it
            (negative points), or have no impact. A value's 0–100 score is the
            share of points that reinforced it (reinforced ÷ total), landing it
            in a tier: Strong (65+), Developing (45–64), or Fragile (below 45).
            Values that barely come up across everyone's answers stay “barely
            tested” until there's enough signal.
          </p>
          <div className="scoring-legend">
            <span className="impact-chip reinforces">Reinforces (+)</span>
            <span className="impact-chip undermines">Undermines (−)</span>
            <span className="impact-chip neutral">No impact</span>
          </div>
        </div>
        <button type="button" className="primary" onClick={handleDownloadCsv}>
          Download CSV
        </button>
      </section>

      <section className="panel scoring-upload">
        <div className="scoring-upload-head">
          <strong>Add questions from CSV</strong>
          <p>
            Upload a CSV with the same columns as the download — Perspective,
            Theme, Question, Answer, and one column per value. Rows that share a
            question become its answer options, and impacts read as{" "}
            <code>+N</code> (reinforces) or <code>-N</code> (undermines). New
            questions are appended to the question bank.
          </p>
        </div>
        <div className="scoring-upload-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={handleFile}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
          >
            Choose CSV…
          </button>
        </div>
        {importMsg && <p className="admin-status ok">{importMsg}</p>}
        {importErr && <p className="admin-status error">{importErr}</p>}
        {pending && (
          <div className="scoring-pending">
            <ul className="scoring-pending-list">
              {pending.map((q) => (
                <li key={q.id}>
                  <span className={`perspective-pill ${q.perspective}`}>
                    {perspectiveLabel(q.perspective)}
                  </span>
                  <span className="scoring-pending-prompt">{q.prompt}</span>
                  <span className="scoring-pending-count">
                    {q.options.length} answers
                  </span>
                </li>
              ))}
            </ul>
            <div className="scoring-pending-actions">
              <button
                type="button"
                className="ghost"
                onClick={handleCancelImport}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleConfirmImport}
                disabled={saving}
              >
                {saving
                  ? "Adding…"
                  : `Add ${pending.length} question${pending.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
      </section>

      {error && (
        <section className="panel">
          <p className="admin-status error">{error}</p>
        </section>
      )}

      <div className="admin-questions">
        {config.questions.map((q, i) => (
          <article key={q.id} className="panel admin-question scoring-question">
            <div className="admin-question-head">
              <span className="admin-qnum">Q{i + 1}</span>
              <span className={`perspective-pill ${q.perspective}`}>
                {perspectiveLabel(q.perspective)}
              </span>
              <span className="admin-id">{q.theme}</span>
            </div>
            <p className="scoring-prompt">{q.prompt}</p>
            <div className="scoring-options">
              {q.options.map((opt) => {
                const impacts = Object.entries(opt.valueImpacts).filter(([, n]) => n);
                return (
                  <div key={opt.id} className="scoring-option">
                    <div className="scoring-option-head">
                      <span className="scoring-opt-letter">{opt.id.toUpperCase()}</span>
                      <span className="scoring-opt-text">{opt.label}</span>
                    </div>
                    <div className="scoring-impacts">
                      {impacts.length === 0 ? (
                        <span className="impact-chip neutral">No value impact</span>
                      ) : (
                        impacts.map(([value, n]) => (
                          <span
                            key={value}
                            className={`impact-chip ${n > 0 ? "reinforces" : "undermines"}`}
                          >
                            {valueLabels[value] ?? value} {n > 0 ? `+${n}` : n}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
