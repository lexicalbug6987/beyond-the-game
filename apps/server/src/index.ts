import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { aggregateSubmissions, type QuizConfig, type QuizSubmission } from "@team-culture-sim/sim-engine";

// Load quiz content via fs so this works the same under tsx and plain node.
const require = createRequire(import.meta.url);
const quizPath = require.resolve("@team-culture-sim/content/quiz.json");

const TEAM_VALUES = [
  "courage",
  "excellence",
  "respect",
  "trust",
  "care",
  "accountability",
] as const;

let config = JSON.parse(readFileSync(quizPath, "utf-8")) as QuizConfig;
let validQuestionIds = new Set(config.questions.map((q) => q.id));

function reloadQuiz(next: QuizConfig) {
  config = next;
  validQuestionIds = new Set(config.questions.map((q) => q.id));
  writeFileSync(quizPath, JSON.stringify(config, null, 2) + "\n");
}

function isTeamValue(value: string): value is (typeof TEAM_VALUES)[number] {
  return (TEAM_VALUES as readonly string[]).includes(value);
}

function validateQuizConfig(raw: unknown): QuizConfig {
  if (!raw || typeof raw !== "object") throw new Error("Invalid quiz payload");
  const body = raw as QuizConfig;

  if (!body.id || !body.title || !Array.isArray(body.values) || !Array.isArray(body.questions)) {
    throw new Error("Quiz config is missing required fields");
  }
  if (!body.improvementTips || typeof body.improvementTips !== "object") {
    throw new Error("Quiz config is missing improvement tips");
  }

  for (const value of TEAM_VALUES) {
    if (typeof body.improvementTips[value] !== "string") {
      throw new Error(`Missing improvement tip for ${value}`);
    }
  }

  if (body.copy !== undefined) {
    if (!body.copy || typeof body.copy !== "object") {
      throw new Error("Invalid copy section");
    }
    for (const key of ["hostHeadline", "hostLede", "playerHeadline", "playerLede"] as const) {
      if (typeof body.copy[key] !== "string" || !body.copy[key].trim()) {
        throw new Error(`Copy field "${key}" is required`);
      }
    }
  }

  for (const question of body.questions) {
    if (!question.id || !question.theme || !question.prompt) {
      throw new Error(`Question ${question.id ?? "(unknown)"} is incomplete`);
    }
    if (question.perspective !== "self" && question.perspective !== "team") {
      throw new Error(`Question ${question.id} has invalid perspective`);
    }
    if (!Array.isArray(question.options) || question.options.length === 0) {
      throw new Error(`Question ${question.id} needs at least one option`);
    }
    for (const option of question.options) {
      if (!option.id || !option.label) {
        throw new Error(`Question ${question.id} has an incomplete option`);
      }
      if (!option.valueImpacts || typeof option.valueImpacts !== "object") {
        throw new Error(`Question ${question.id} option ${option.id} needs value impacts`);
      }
      for (const [key, delta] of Object.entries(option.valueImpacts)) {
        if (!isTeamValue(key) || typeof delta !== "number") {
          throw new Error(`Question ${question.id} option ${option.id} has invalid impacts`);
        }
      }
    }
  }

  return body;
}

// ── Editable UI content ────────────────────────────────────────────────────────
interface ContentField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}
interface ContentPage {
  key: string;
  title: string;
  description?: string;
  fields: ContentField[];
}
const uiContentPath = require.resolve("@team-culture-sim/content/ui-content.json");
const uiDefaults = JSON.parse(readFileSync(uiContentPath, "utf-8")) as { pages: ContentPage[] };
// Valid page/field keys, used to reject anything unexpected on save.
const validFieldKeys = new Map<string, Set<string>>(
  uiDefaults.pages.map((p) => [p.key, new Set(p.fields.map((f) => f.key))]),
);
const MAX_FIELD_LENGTH = 2000;

interface Session {
  code: string;
  teamName: string;
  createdAt: number;
  submissions: QuizSubmission[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "sessions.json");
const UI_DATA_FILE = join(__dirname, "..", "data", "ui-content.json");

const sessions = new Map<string, Session>();
loadFromDisk();

// Saved UI text overrides, keyed by pageKey → fieldKey → value.
let uiOverrides: Record<string, Record<string, string>> = loadUiOverrides();

function loadUiOverrides(): Record<string, Record<string, string>> {
  if (!existsSync(UI_DATA_FILE)) return {};
  try {
    return JSON.parse(readFileSync(UI_DATA_FILE, "utf-8")) as Record<string, Record<string, string>>;
  } catch (err) {
    console.warn("Could not load UI content file:", err);
    return {};
  }
}

function saveUiOverrides() {
  try {
    mkdirSync(dirname(UI_DATA_FILE), { recursive: true });
    writeFileSync(UI_DATA_FILE, JSON.stringify(uiOverrides, null, 2));
  } catch (err) {
    console.warn("Could not save UI content file:", err);
  }
}

/** Merge saved overrides onto the bundled defaults so new fields always render. */
function mergedContentPages(): ContentPage[] {
  return uiDefaults.pages.map((page) => ({
    ...page,
    fields: page.fields.map((field) => ({
      ...field,
      value: uiOverrides[page.key]?.[field.key] ?? field.value,
    })),
  }));
}

function loadFromDisk() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf-8")) as Session[];
    for (const session of raw) sessions.set(session.code, session);
    console.log(`Loaded ${sessions.size} session(s) from disk.`);
  } catch (err) {
    console.warn("Could not load sessions file:", err);
  }
}

function saveToDisk() {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify([...sessions.values()], null, 2));
  } catch (err) {
    console.warn("Could not save sessions file:", err);
  }
}

// Avoid ambiguous characters (0/O, 1/I) so codes are easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  } while (sessions.has(code));
  return code;
}

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());
app.disable("x-powered-by");

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, methods: ["GET", "POST", "PUT"], credentials: false }));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "32kb" }));

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Global: 200 req / minute per IP across all API routes
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

// Admin auth: 10 attempts / 15 min per IP (brute-force protection)
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
  skipSuccessfulRequests: true,
});

// Session creation: 20 sessions / hour per IP
const createSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sessions created, please try again later." },
});

// Submission: 60 submissions / 10 min per IP
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please slow down." },
});

app.use("/api", globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

// ── Admin tokens ───────────────────────────────────────────────────────────────
// Issued on successful auth; required for content writes. In-memory, 24h expiry.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const adminTokens = new Map<string, number>(); // token → expiresAt

function issueToken(): string {
  const token = randomUUID();
  adminTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const expiresAt = adminTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    adminTokens.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!isValidToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.post("/api/admin/auth", adminAuthLimiter, (req, res) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).json({ error: "Admin password not configured" });
    return;
  }
  const attempt = String(req.body?.password ?? "");
  if (attempt === password) {
    res.json({ ok: true, token: issueToken() });
  } else {
    res.status(401).json({ error: "Incorrect password" });
  }
});

// Expose the quiz content so the client always matches the server's scoring.
app.get("/api/quiz", (_req, res) => {
  res.json(config);
});

app.put("/api/quiz", requireAdmin, (req, res) => {
  try {
    const next = validateQuizConfig(req.body);
    reloadQuiz(next);
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Editable page content ───────────────────────────────────────────────────────
app.get("/api/content", (_req, res) => {
  res.json({ pages: mergedContentPages() });
});

app.put("/api/content", requireAdmin, (req, res) => {
  const incoming = req.body?.pages;
  if (!Array.isArray(incoming)) {
    res.status(400).json({ error: "Missing pages" });
    return;
  }

  // Keep only known page/field keys with string values; ignore anything else.
  const next: Record<string, Record<string, string>> = {};
  for (const page of incoming) {
    const pageKey = String(page?.key ?? "");
    const allowedFields = validFieldKeys.get(pageKey);
    if (!allowedFields || !Array.isArray(page?.fields)) continue;
    for (const field of page.fields) {
      const fieldKey = String(field?.key ?? "");
      if (!allowedFields.has(fieldKey) || typeof field?.value !== "string") continue;
      (next[pageKey] ??= {})[fieldKey] = field.value.slice(0, MAX_FIELD_LENGTH);
    }
  }

  uiOverrides = next;
  saveUiOverrides();
  res.json({ ok: true, pages: mergedContentPages() });
});

app.post("/api/sessions", createSessionLimiter, (req, res) => {
  const teamName = String(req.body?.teamName ?? "").trim().slice(0, 60) || "Your team";
  const code = makeCode();
  const session: Session = { code, teamName, createdAt: Date.now(), submissions: [] };
  sessions.set(code, session);
  saveToDisk();
  res.status(201).json({ code, teamName });
});

function getSession(req: express.Request, res: express.Response): Session | undefined {
  const code = String(req.params.code ?? "").toUpperCase();
  const session = sessions.get(code);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return undefined;
  }
  return session;
}

app.get("/api/sessions/:code", (req, res) => {
  const session = getSession(req, res);
  if (!session) return;
  res.json({
    code: session.code,
    teamName: session.teamName,
    participantCount: session.submissions.length,
  });
});

app.post("/api/sessions/:code/submissions", submitLimiter, (req, res) => {
  const session = getSession(req, res);
  if (!session) return;

  const rawAnswers = req.body?.answers;
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    res.status(400).json({ error: "Missing answers" });
    return;
  }

  // Keep only known questions; ignore anything unexpected from the client.
  const answers: Record<string, string> = {};
  for (const [questionId, optionId] of Object.entries(rawAnswers)) {
    if (validQuestionIds.has(questionId) && typeof optionId === "string") {
      // Option IDs are short single-word identifiers — cap length to prevent oversized values.
      answers[questionId] = String(optionId).slice(0, 32);
    }
  }
  if (Object.keys(answers).length === 0) {
    res.status(400).json({ error: "No valid answers" });
    return;
  }

  session.submissions.push({ id: randomUUID(), answers, submittedAt: Date.now() });
  saveToDisk();
  res.status(201).json({ ok: true, participantCount: session.submissions.length });
});

app.get("/api/sessions/:code/results", (req, res) => {
  const session = getSession(req, res);
  if (!session) return;
  const result = aggregateSubmissions(config, session.submissions);
  res.json({ teamName: session.teamName, code: session.code, ...result });
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`Beyond the Game server listening on http://localhost:${PORT}`);
});
