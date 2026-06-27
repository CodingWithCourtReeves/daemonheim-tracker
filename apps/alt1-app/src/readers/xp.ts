import type { EventSender } from "../events.js";

/**
 * Periodically samples skill XP and emits an xp_sample event.
 *
 * This reader needs NO screen calibration: it pulls from the public RuneMetrics
 * profile endpoint, which returns total XP, combat level, and a per-skill array.
 * Requires the account's RuneMetrics privacy to be set to public in-game.
 *
 * (Alternative: Alt1's "Get game state" permission exposes live xp counters with
 * no network call. Wire that in later for real-time XP/hr; this is the robust
 * baseline that works the moment you run it.)
 */
const PROFILE_URL = "https://apps.runescape.com/runemetrics/profile/profile";
const DUNGEONEERING = "Dungeoneering";

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

      const skills: Record<string, number> = {};
      let dungeoneeringXp = 0;
      for (const s of data.skillvalues ?? []) {
        const name = SKILL_NAMES[s.id] ?? String(s.id);
        const xp = Math.floor((s.xp ?? 0) / 10); // RuneMetrics reports xp*10
        skills[name.toLowerCase()] = xp;
        if (name === DUNGEONEERING) dungeoneeringXp = xp;
      }

      this.sender.emit({
        type: "xp_sample",
        dungeoneeringXp,
        totalXp: Math.floor((data.totalxp ?? 0)),
        skills,
      });
    } catch (err) {
      console.warn("[daemonheim] xp sample failed", err);
    }
  }
}

/** RuneMetrics skill ids → names (index matches the hiscores order). */
const SKILL_NAMES: Record<number, string> = {
  0: "Attack", 1: "Defence", 2: "Strength", 3: "Constitution", 4: "Ranged",
  5: "Prayer", 6: "Magic", 7: "Cooking", 8: "Woodcutting", 9: "Fletching",
  10: "Fishing", 11: "Firemaking", 12: "Crafting", 13: "Smithing", 14: "Mining",
  15: "Herblore", 16: "Agility", 17: "Thieving", 18: "Slayer", 19: "Farming",
  20: "Runecrafting", 21: "Hunter", 22: "Construction", 23: "Summoning",
  24: "Dungeoneering", 25: "Divination", 26: "Invention", 27: "Archaeology",
  28: "Necromancy",
};
