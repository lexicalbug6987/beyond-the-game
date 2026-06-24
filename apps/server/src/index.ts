import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { aggregateSubmissions, type QuizConfig, type QuizSubmission } from "@team-culture-sim/sim-engine";
import { createBlobStore, createFileBlobStore, isPersistentStorage, type BlobStore } from "./store.js";

// Bundled defaults — never written at runtime.
const require = createRequire(import.meta.url);
const bundledQuizPath = require.resolve("@team-culture-sim/content/quiz.json");
const bundledQuiz = JSON.parse(readFileSync(bundledQuizPath, "utf-8")) as QuizConfig;

const TEAM_VALUES = [
  "courage",
  "excellence",
  "respect",
  "trust",
  "care",
  "accountability",
] as const;

let config = bundledQuiz;
let validQuestionIds = new Set(config.questions.map((q) => q.id));
let store: BlobStore;

async function saveQuiz(next: QuizConfig) {
  config = next;
  validQuestionIds = new Set(config.questions.map((q) => q.id));
  await store.write("quiz", config);
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

const sessions = new Map<string, Session>();

// Saved UI text overrides, keyed by pageKey → fieldKey → value.
let uiOverrides: Record<string, Record<string, string>> = {};

async function loadUiOverrides(): Promise<Record<string, Record<string, string>>> {
  const raw = await store.read("ui-content");
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, Record<string, string>>;
}

async function saveUiOverrides() {
  await store.write("ui-content", uiOverrides);
  const saved = await store.read("ui-content");
  if (!saved) {
    throw new Error("Storage write failed — page content was not saved.");
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

function contentField(pages: ContentPage[], pageKey: string, fieldKey: string): string | undefined {
  const page = pages.find((p) => p.key === pageKey);
  return page?.fields.find((f) => f.key === fieldKey)?.value;
}

/** Keep quiz.json copy in sync with the host/player page content fields. */
async function syncQuizCopyFromUiPages() {
  const pages = mergedContentPages();
  const hostHeadline = contentField(pages, "hostSetup", "title");
  const hostLede = contentField(pages, "hostSetup", "lede");
  const playerHeadline = contentField(pages, "playerIntro", "title");
  const playerLede = contentField(pages, "playerIntro", "lede");
  if (!hostHeadline || !hostLede || !playerHeadline || !playerLede) return;

  config = {
    ...config,
    copy: { hostHeadline, hostLede, playerHeadline, playerLede },
  };
  await saveQuiz(config);
}

/** Keep saved page content in sync with quiz.json copy fields. */
async function syncUiOverridesFromQuizCopy(copy: NonNullable<QuizConfig["copy"]>) {
  (uiOverrides.hostSetup ??= {}).title = copy.hostHeadline;
  uiOverrides.hostSetup.lede = copy.hostLede;
  (uiOverrides.playerIntro ??= {}).title = copy.playerHeadline;
  uiOverrides.playerIntro.lede = copy.playerLede;
  await saveUiOverrides();
}

/** On boot, migrate legacy quiz copy into page content if nothing was saved yet. */
async function migrateQuizCopyToUiIfNeeded() {
  if (!config.copy) return;
  const needsHostTitle = !uiOverrides.hostSetup?.title;
  const needsHostLede = !uiOverrides.hostSetup?.lede;
  if (!needsHostTitle && !needsHostLede) return;
  await syncUiOverridesFromQuizCopy(config.copy);
}

async function loadSessionsFromStore() {
  const raw = await store.read("sessions");
  if (!Array.isArray(raw)) return;
  for (const session of raw as Session[]) sessions.set(session.code, session);
  console.log(`Loaded ${sessions.size} session(s) from storage.`);
}

async function saveSessionsToStore() {
  try {
    await store.write("sessions", [...sessions.values()]);
  } catch (err) {
    console.warn("Could not save sessions:", err);
  }
}

async function loadQuizFromStore() {
  const saved = await store.read("quiz");
  if (!saved) {
    console.log("No saved quiz found — using bundled defaults.");
    return;
  }
  try {
    config = validateQuizConfig(saved);
    validQuestionIds = new Set(config.questions.map((q) => q.id));
    console.log("Loaded quiz from storage.");
  } catch (err) {
    console.warn("Saved quiz was invalid — using bundled defaults:", err);
    config = bundledQuiz;
    validQuestionIds = new Set(config.questions.map((q) => q.id));
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
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  const backend = store?.backend() ?? "file";
  res.json({
    ok: true,
    sessions: sessions.size,
    storage: backend,
    persistent: store ? isPersistentStorage(backend) : false,
  });
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

app.put("/api/quiz", requireAdmin, async (req, res) => {
  try {
    const next = validateQuizConfig(req.body);
    await saveQuiz(next);
    if (next.copy) await syncUiOverridesFromQuizCopy(next.copy);
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Editable page content ───────────────────────────────────────────────────────
app.get("/api/content", (_req, res) => {
  res.json({ pages: mergedContentPages() });
});

app.put("/api/content", requireAdmin, async (req, res) => {
  const incoming = req.body?.pages;
  if (!Array.isArray(incoming)) {
    res.status(400).json({ error: "Missing pages" });
    return;
  }

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

  const previous = structuredClone(uiOverrides);
  uiOverrides = next;
  try {
    await saveUiOverrides();
    try {
      await syncQuizCopyFromUiPages();
    } catch (err) {
      console.warn("Could not sync quiz copy after content save:", err);
    }
    res.json({
      ok: true,
      pages: mergedContentPages(),
      storage: store.backend(),
      persistent: isPersistentStorage(store.backend()),
    });
  } catch (err) {
    uiOverrides = previous;
    res.status(503).json({ error: (err as Error).message || "Could not save page content" });
  }
});

app.post("/api/sessions", createSessionLimiter, async (req, res) => {
  const teamName = String(req.body?.teamName ?? "").trim().slice(0, 60) || "Your team";
  const code = makeCode();
  const session: Session = { code, teamName, createdAt: Date.now(), submissions: [] };
  sessions.set(code, session);
  await saveSessionsToStore();
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

app.post("/api/sessions/:code/submissions", submitLimiter, async (req, res) => {
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
  await saveSessionsToStore();
  res.status(201).json({ ok: true, participantCount: session.submissions.length });
});

app.get("/api/sessions/:code/results", (req, res) => {
  const session = getSession(req, res);
  if (!session) return;
  const result = aggregateSubmissions(config, session.submissions);
  res.json({ teamName: session.teamName, code: session.code, ...result });
});

// ── Static web app (production / Replit deployment) ───────────────────────────
const WEB_DIST = join(__dirname, "..", "..", "web", "dist");

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(["/", "/admin", "/admin.html"], (req, res) => {
    const wantsAdmin = req.path === "/admin" || req.path === "/admin.html";
    const adminFile = join(WEB_DIST, "admin.html");
    const file = wantsAdmin && existsSync(adminFile) ? adminFile : join(WEB_DIST, "index.html");
    res.sendFile(file, (err) => {
      if (err) {
        console.error("Failed to send page:", file, err);
        res.status(500).send("App files missing — run the build step.");
      }
    });
  });
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(join(WEB_DIST, "index.html"), (err) => {
      if (err) {
        console.error("Failed to send index.html:", err);
        res.status(500).send("App files missing — run the build step.");
      }
    });
  });
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const PORT = Number(process.env.PORT ?? 8787);

async function migrateLegacyFileStore() {
  const legacyDir = process.env.DATA_DIR ?? join(__dirname, "..", "data");
  const legacyFiles: Array<{ key: "quiz" | "ui-content" | "sessions"; file: string }> = [
    { key: "quiz", file: "quiz.json" },
    { key: "ui-content", file: "ui-content.json" },
    { key: "sessions", file: "sessions.json" },
  ];

  for (const { key, file } of legacyFiles) {
    if (await store.read(key)) continue;
    const path = join(legacyDir, file);
    if (!existsSync(path)) continue;
    try {
      const value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
      await store.write(key, value);
      console.log(`Imported legacy ${key} from ${path}`);
    } catch (err) {
      console.warn(`Could not import legacy ${key}:`, err);
    }
  }
}

async function main() {
  try {
    store = await createBlobStore();
    await migrateLegacyFileStore();
    await loadQuizFromStore();
    uiOverrides = await loadUiOverrides();
    await loadSessionsFromStore();
    await migrateQuizCopyToUiIfNeeded();
  } catch (err) {
    console.error("Storage init failed — starting with bundled defaults:", err);
    store = await createFileBlobStore();
    config = bundledQuiz;
    validQuestionIds = new Set(config.questions.map((q) => q.id));
    uiOverrides = {};
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Beyond the Game server listening on http://0.0.0.0:${PORT}`);
    console.log(`Storage backend: ${store.backend()}`);
  });
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
