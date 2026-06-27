import type { EventSender } from "../events.js";
import { SKILL_BY_ID, type SkillSample } from "@daemonheim/shared";

/**
 * Periodically samples skill XP and emits an xp_sample event.
 *
 * This reader needs NO screen calibration: it pulls from the public RuneMetrics
 * profile endpoint, which returns total XP, total level, combat level, and a
 * per-skill array. Requires the account's RuneMetrics privacy set to public.
 *
 * RuneMetrics quirks (verified against the live endpoint):
 *  - each `skillvalues[]` entry is `{ id, level, xp }` and **xp is the real xp ×10**
 *    (divide by 10), while top-level `totalxp` is the real total (do NOT divide).
 *  - `combatlevel`, `totalskill`, and `rank` are provided directly; `rank` is a
 *    comma-formatted string.
 *
 * (Alternative: Alt1's "Get game state" permission exposes live xp counters with
 * no network call. Wire that in later for real-time XP/hr; this is the robust
 * baseline that works the moment you run it.)
 */
const PROFILE_URL = "https://apps.runescape.com/runemetrics/profile/profile";
const DUNGEONEERING_ID = 24;

export class XpReader {
  private lastSample = 0;

  constructor(
    private sender: EventSender,
    private player: string,
    private everyMs = 60_000,
  ) {}

  async maybeSample() {
    const now = Date.now();
    if (now - this.lastSample < this.everyMs) return;
    this.lastSample = now;

    try {
      const url = `${PROFILE_URL}?user=${encodeURIComponent(this.player)}&activities=0`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.error) return; // e.g. PROFILE_PRIVATE / NO_PROFILE

      const skills: SkillSample[] = [];
      let dungeoneeringXp = 0;
      for (const s of data.skillvalues ?? []) {
        if (SKILL_BY_ID[s.id] == null) continue; // ignore unknown ids
        const xp = Math.floor((s.xp ?? 0) / 10); // RuneMetrics reports xp ×10
        skills.push({ id: s.id, level: s.level ?? 1, xp });
        if (s.id === DUNGEONEERING_ID) dungeoneeringXp = xp;
      }

      this.sender.emit({
        type: "xp_sample",
        dungeoneeringXp,
        totalXp: Math.floor(data.totalxp ?? 0),
        totalLevel: data.totalskill ?? undefined,
        combatLevel: data.combatlevel ?? undefined,
        rank: parseRank(data.rank),
        skills,
      });
    } catch (err) {
      console.warn("[daemonheim] xp sample failed", err);
    }
  }
}

/** RuneMetrics `rank` is a comma-formatted string (e.g. "1,234,567"). */
function parseRank(rank: unknown): number | undefined {
  if (typeof rank !== "string") return undefined;
  const n = parseInt(rank.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}
