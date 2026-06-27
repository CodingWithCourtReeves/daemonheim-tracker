import type { TrackerEvent, EventInput } from "@daemonheim/shared";
import type { AppConfig } from "./config.js";

/**
 * Builds events and ships them to the API. Events are queued in memory and
 * retried, so a brief network blip during a stream doesn't lose a boss kill.
 * Each event gets a UUID; the API dedupes, so retries are safe.
 */
export class EventSender {
  private queue: TrackerEvent[] = [];
  private sending = false;

  constructor(private cfg: AppConfig) {}

  emit(ev: EventInput) {
    const full = {
      ...ev,
      id: crypto.randomUUID(),
      ts: Date.now(),
      player: this.cfg.player,
    } as TrackerEvent;
    this.queue.push(full);
    void this.flush();
  }

  private async flush() {
    if (this.sending || this.queue.length === 0) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const batch = this.queue.slice(0, 20);
        const res = await fetch(`${this.cfg.apiBase}/ingest`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.cfg.ingestKey ? { "x-ingest-key": this.cfg.ingestKey } : {}),
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) throw new Error(`ingest ${res.status}`);
        this.queue.splice(0, batch.length);
      }
    } catch (err) {
      console.warn("[daemonheim] ingest failed, will retry", err);
      // leave the queue intact; next emit or the poll loop retries
    } finally {
      this.sending = false;
    }
  }
}
