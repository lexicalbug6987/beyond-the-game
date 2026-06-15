import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { aggregateSubmissions, type QuizConfig, type QuizSubmission } from "@team-culture-sim/sim-engine";

// Load quiz content via fs so this works the same under tsx and plain node.
const require = createRequire(import.meta.url);
const quizPath = require.resolve("@team-culture-sim/content/quiz.json");
const config = JSON.parse(readFileSync(quizPath, "utf-8")) as QuizConfig;
const validQuestionIds = new Set(config.questions.map((q) => q.id));

interface Session {
  code: string;
  teamName: string;
  createdAt: number;
  submissions: QuizSubmission[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "sessions.json");

const sessions = new Map<string, Session>();
loadFromDisk();

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
app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

// Expose the quiz content so the client always matches the server's scoring.
app.get("/api/quiz", (_req, res) => {
  res.json(config);
});

app.post("/api/sessions", (req, res) => {
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

app.post("/api/sessions/:code/submissions", (req, res) => {
  const session = getSession(req, res);
  if (!session) return;

  const rawAnswers = req.body?.answers;
  if (!rawAnswers || typeof rawAnswers !== "object") {
    res.status(400).json({ error: "Missing answers" });
    return;
  }

  // Keep only known questions; ignore anything unexpected from the client.
  const answers: Record<string, string> = {};
  for (const [questionId, optionId] of Object.entries(rawAnswers)) {
    if (validQuestionIds.has(questionId) && typeof optionId === "string") {
      answers[questionId] = optionId;
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

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`Beyond the Game server listening on http://localhost:${PORT}`);
});
