import type { EventSender } from "../events.js";
import { parseRuneMetricsProfile } from "@daemonheim/shared";

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
      const sample = parseRuneMetricsProfile(await res.json());
      if (!sample) return; // PROFILE_PRIVATE / NO_PROFILE
      this.sender.emit({ type: "xp_sample", ...sample });
    } catch (err) {
      console.warn("[daemonheim] xp sample failed", err);
    }
  }
}
