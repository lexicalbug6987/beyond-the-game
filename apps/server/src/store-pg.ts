import pg from "pg";
import type { BlobStore, StoreKey } from "./store.js";

export function createPgBlobStore(connectionString: string): BlobStore {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  return {
    backend: () => "postgres" as const,

    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS btg_store (
          key TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    },

    async read(key: StoreKey) {
      const result = await pool.query<{ data: unknown }>(
        "SELECT data FROM btg_store WHERE key = $1",
        [key],
      );
      return result.rows[0]?.data ?? null;
    },

    async write(key: StoreKey, value: unknown) {
      await pool.query(
        `
          INSERT INTO btg_store (key, data, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (key) DO UPDATE
          SET data = EXCLUDED.data, updated_at = NOW()
        `,
        [key, JSON.stringify(value)],
      );
    },
  };
}
