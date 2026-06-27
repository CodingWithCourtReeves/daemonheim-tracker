import pg from "pg";
import { JsonFileStore, type EventStore } from "./store.js";
import { PostgresStore } from "./postgres-store.js";

export interface StoreHandle {
  store: EventStore;
  /** Call on shutdown to release the connection pool (no-op for the file store). */
  close: () => Promise<void>;
  kind: "postgres" | "json";
}

export function createStore(): StoreHandle {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      // Coolify/Hetzner internal networking is plaintext; flip on for managed PG.
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    return { store: new PostgresStore(pool), close: () => pool.end(), kind: "postgres" };
  }
  const file = process.env.DATA_FILE ?? "./data/events.json";
  return { store: new JsonFileStore(file), close: async () => {}, kind: "json" };
}
