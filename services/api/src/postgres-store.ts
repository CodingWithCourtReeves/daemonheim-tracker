import type { Pool } from "pg";
import type { TrackerEvent } from "@daemonheim/shared";
import type { EventStore } from "./store.js";

/**
 * Postgres-backed event store. Same contract as JsonFileStore, so the server and
 * aggregate() don't change — set DATABASE_URL and this takes over.
 *
 * Dedupe is enforced by the primary key on `id` + ON CONFLICT DO NOTHING, so
 * re-sends from the Alt1 app are idempotent at the database level. Deletes are
 * soft (voided=true) to preserve the append-only audit trail; aggregate() only
 * ever sees non-voided rows.
 */
export class PostgresStore implements EventStore {
  constructor(private pool: Pool) {}

  async append(event: TrackerEvent): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO events (id, player, type, ts, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.player, event.type, event.ts, JSON.stringify(event)],
    );
    return res.rowCount === 1; // 0 = duplicate id, already stored
  }

  async all(player?: string): Promise<TrackerEvent[]> {
    const res = player
      ? await this.pool.query(
          `SELECT data FROM events WHERE player = $1 AND NOT voided ORDER BY ts ASC`,
          [player],
        )
      : await this.pool.query(
          `SELECT data FROM events WHERE NOT voided ORDER BY ts ASC`,
        );
    // jsonb comes back already parsed by node-postgres
    return res.rows.map((r) => r.data as TrackerEvent);
  }

  async void(id: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE events SET voided = true WHERE id = $1 AND NOT voided`,
      [id],
    );
    return res.rowCount === 1;
  }
}
