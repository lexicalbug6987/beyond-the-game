import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type StoreKey = "quiz" | "ui-content" | "sessions";

export interface BlobStore {
  init(): Promise<void>;
  read(key: StoreKey): Promise<unknown | null>;
  write(key: StoreKey, value: unknown): Promise<void>;
  backend(): "file" | "postgres";
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function defaultDataDir(): string {
  return process.env.DATA_DIR ?? join(__dirname, "..", "data");
}

const FILE_NAMES: Record<StoreKey, string> = {
  quiz: "quiz.json",
  "ui-content": "ui-content.json",
  sessions: "sessions.json",
};

class FileBlobStore implements BlobStore {
  constructor(private readonly dataDir: string) {}

  backend(): "file" {
    return "file";
  }

  async init(): Promise<void> {
    mkdirSync(this.dataDir, { recursive: true });
  }

  private pathFor(key: StoreKey): string {
    return join(this.dataDir, FILE_NAMES[key]);
  }

  async read(key: StoreKey): Promise<unknown | null> {
    const path = this.pathFor(key);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as unknown;
    } catch (err) {
      console.warn(`Could not read ${path}:`, err);
      return null;
    }
  }

  async write(key: StoreKey, value: unknown): Promise<void> {
    const path = this.pathFor(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2));
  }
}

export async function createBlobStore(): Promise<BlobStore> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    console.log("Using PostgreSQL for admin content and sessions.");
    const { createPgBlobStore } = await import("./store-pg.js");
    return createPgBlobStore(databaseUrl);
  }

  const dataDir = defaultDataDir();
  console.log(`Using file storage at ${dataDir} (set DATABASE_URL on Replit deploy for persistence).`);
  return new FileBlobStore(dataDir);
}
