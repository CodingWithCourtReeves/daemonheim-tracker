import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { TrackerEvent } from "@daemonheim/shared";

/**
 * Append-only event store. The JSON-file implementation is zero-config so the
 * project runs the moment it's cloned. Swap in Postgres for production by
 * implementing the same interface (see README → Going to production).
 */
export interface EventStore {
  append(event: TrackerEvent): Promise<boolean>; // false if duplicate id
  all(player?: string): Promise<TrackerEvent[]>;
  void(id: string): Promise<boolean>; // remove/hide a bad event (e.g. OCR misread)
}

export class JsonFileStore implements EventStore {
  private events: TrackerEvent[] = [];
  private seen = new Set<string>();
  private loaded = false;

  constructor(private path: string) {}

  private async load() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.path, "utf8");
      this.events = JSON.parse(raw);
      for (const e of this.events) this.seen.add(e.id);
    } catch {
      this.events = []; // file doesn't exist yet — first run
    }
    this.loaded = true;
  }

  private async persist() {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.events, null, 2));
  }

  async append(event: TrackerEvent): Promise<boolean> {
    await this.load();
    if (this.seen.has(event.id)) return false; // idempotent re-send
    this.seen.add(event.id);
    this.events.push(event);
    await this.persist();
    return true;
  }

  async all(player?: string): Promise<TrackerEvent[]> {
    await this.load();
    return player ? this.events.filter((e) => e.player === player) : this.events;
  }

  async void(id: string): Promise<boolean> {
    await this.load();
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.events.splice(idx, 1);
    this.seen.delete(id);
    await this.persist();
    return true;
  }
}
