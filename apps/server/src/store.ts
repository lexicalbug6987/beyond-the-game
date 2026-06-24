import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type StoreKey = "quiz" | "ui-content" | "sessions";
export type StorageBackend = "file" | "postgres";

export interface BlobStore {
  init(): Promise<void>;
  read(key: StoreKey): Promise<unknown | null>;
  write(key: StoreKey, value: unknown): Promise<void>;
  backend(): StorageBackend;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function defaultDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.REPL_ID) {
    return "/tmp/beyond-the-game-data";
  }
  return join(__dirname, "..", "data");
}

const FILE_NAMES: Record<StoreKey, string> = {
  quiz: "quiz.json",
  "ui-content": "ui-content.json",
  sessions: "sessions.json",
};

class FileBlobStore implements BlobStore {
  constructor(private readonly dataDir: string) {}

  backend(): StorageBackend {
    return "file";
  }

  async init(): Promise<void> {
    try {
      mkdirSync(this.dataDir, { recursive: true });
    } catch (err) {
      console.warn(`Could not create data directory at ${this.dataDir}:`, err);
    }
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
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(value, null, 2));
    } catch (err) {
      console.warn(`Could not write ${path}:`, err);
      throw err;
    }
  }
}

function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.REPLIT_DB_URL?.trim() ||
    undefined
  );
}

export function isPersistentStorage(backend: StorageBackend): boolean {
  return backend === "postgres";
}

export async function createFileBlobStore(dataDir = defaultDataDir()): Promise<BlobStore> {
  console.log(`Using file storage at ${dataDir}`);
  const fileStore = new FileBlobStore(dataDir);
  await fileStore.init();
  return fileStore;
}

export async function createBlobStore(): Promise<BlobStore> {
  const databaseUrl = resolveDatabaseUrl();
  if (databaseUrl) {
    try {
      const { createPgBlobStore } = await import("./store-pg.js");
      const pgStore = createPgBlobStore(databaseUrl);
      await pgStore.init();
      console.log("Using PostgreSQL for admin content and sessions.");
      return pgStore;
    } catch (err) {
      console.warn("PostgreSQL unavailable — falling back to file storage:", err);
    }
  }

  return createFileBlobStore();
}
