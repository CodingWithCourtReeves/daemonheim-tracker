import { randomUUID } from "node:crypto";
import { parseRuneMetricsProfile } from "@daemonheim/shared";
import type { EventStore } from "./store.js";

const PROFILE_URL = "https://apps.runescape.com/runemetrics/profile/profile";

/**
 * Server-side RuneMetrics poller. Keeps the dashboard's XP/skills current 24/7
 * without the Alt1 app having to be open — the Alt1 app still adds the things
 * RuneMetrics can't see (floor clears, boss kills, drops, deaths).
 *
 * Appends an xp_sample only when total XP changed, so the append-only log stays
 * lean and the history/milestones reflect real progress rather than idle ticks.
 * Returns a stop() function.
 */
export function startRuneMetricsPoller(
  store: EventStore,
  player: string,
  intervalMs = 60_000,
  log: (msg: string) => void = () => {},
): () => void {
  let lastTotalXp = -1;

  async function poll() {
    try {
      const url = `${PROFILE_URL}?user=${encodeURIComponent(player)}&activities=0`;
      const res = await fetch(url, { headers: { "User-Agent": "daemonheim-tracker" } });
      if (!res.ok) return;
      const sample = parseRuneMetricsProfile(await res.json());
      if (!sample) return; // PROFILE_PRIVATE / NO_PROFILE
      if (sample.totalXp === lastTotalXp) return; // nothing changed since last poll
      lastTotalXp = sample.totalXp;
      await store.append({
        id: randomUUID(),
        ts: Date.now(),
        player,
        type: "xp_sample",
        ...sample,
      });
      log(`[poller] sampled ${player}: total xp ${sample.totalXp}, total level ${sample.totalLevel}`);
    } catch (err) {
      log(`[poller] failed: ${String(err)}`);
    }
  }

  void poll();
  const timer = setInterval(() => void poll(), intervalMs);
  return () => clearInterval(timer);
}
