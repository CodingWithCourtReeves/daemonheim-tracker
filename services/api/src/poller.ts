import { parseRuneMetricsProfile, parseAdventureLog, type ParsedActivity } from "@daemonheim/shared";
import type { TrackerEvent } from "@daemonheim/shared";
import type { EventStore } from "./store.js";

const PROFILE_URL = "https://apps.runescape.com/runemetrics/profile/profile";

/**
 * Server-side RuneMetrics poller. Keeps the dashboard current 24/7 without Alt1:
 *  - an xp_sample (skills/levels/XP) whenever total XP changes, and
 *  - boss kills, deepest-floor progression, and deaths parsed from the player's
 *    adventure log (the `activities` feed).
 *
 * Adventure-log events get DETERMINISTIC ids derived from their content, so the
 * store's id-dedupe makes re-polling (and restarts) idempotent — no duplicates.
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
      const url = `${PROFILE_URL}?user=${encodeURIComponent(player)}&activities=20`;
      const res = await fetch(url, { headers: { "User-Agent": "daemonheim-tracker" } });
      if (!res.ok) return;
      const data: any = await res.json();

      // 1) XP / skills snapshot (only on change, to keep the log lean)
      const sample = parseRuneMetricsProfile(data);
      if (sample && sample.totalXp !== lastTotalXp) {
        lastTotalXp = sample.totalXp;
        await store.append({ id: crypto.randomUUID(), ts: Date.now(), player, type: "xp_sample", ...sample });
        log(`[poller] xp_sample ${player}: total xp ${sample.totalXp}, level ${sample.totalLevel}`);
      }

      // 2) Adventure-log events (idempotent via deterministic ids)
      let added = 0;
      for (const act of parseAdventureLog(data.activities ?? [])) {
        for (const ev of toEvents(act, player)) {
          if (await store.append(ev)) added++;
        }
      }
      if (added) log(`[poller] adventure log: +${added} new event(s)`);
    } catch (err) {
      log(`[poller] failed: ${String(err)}`);
    }
  }

  void poll();
  const timer = setInterval(() => void poll(), intervalMs);
  return () => clearInterval(timer);
}

/** Convert a parsed activity into one or more tracker events with stable ids. */
function toEvents(act: ParsedActivity, player: string): TrackerEvent[] {
  // Adventure-log dates are minute-resolution; approximate ts from them.
  const ts = parseLogDate(act.date);
  const base = `act|${player}|${act.date}`;
  if (act.kind === "boss") {
    return Array.from({ length: Math.max(1, act.count) }, (_, i) => ({
      id: stableId(`${base}|boss|${act.boss}|${i}`),
      ts, player, type: "boss_killed", boss: act.boss,
    }));
  }
  if (act.kind === "floor") {
    return [{ id: stableId(`${base}|floor|${act.floor}`), ts, player, type: "floor_completed", floor: act.floor }];
  }
  return [{ id: stableId(`${base}|death`), ts, player, type: "death" }];
}

/** Deterministic, short (<=64 char) id from a content string (FNV-1a). */
function stableId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `act-${(h >>> 0).toString(36)}`;
}

/** Parse RuneMetrics' "28-Jun-2026 05:29" into epoch ms; fall back to now. */
function parseLogDate(date: string): number {
  const t = Date.parse(date.replace(/-/g, " "));
  return Number.isFinite(t) ? t : Date.now();
}
