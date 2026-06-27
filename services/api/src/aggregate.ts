import {
  type TrackerEvent,
  type DashboardStats,
  xpToLevel,
} from "@daemonheim/shared";

/**
 * Pure function: events in, dashboard stats out. No I/O here so it's trivial to
 * unit test and so the dashboard always reflects the full history deterministically.
 */
export function aggregate(player: string, events: TrackerEvent[]): DashboardStats {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);

  const clearsByFloor = new Array<number>(60).fill(0);
  const bossKills = new Map<string, number>();
  const dropMap = new Map<string, { rarity?: string; count: number; firstSeen: number }>();
  const recent: DashboardStats["recent"] = [];

  let highestFloor = 0;
  let floorsCleared = 0;
  let descents = 0;
  let deaths = 0;
  let lastDeath: DashboardStats["lastDeath"];
  let timeInDungeonSec = 0;
  let dungeoneeringXp = 0;
  let totalXp = 0;

  for (const e of sorted) {
    switch (e.type) {
      case "floor_completed": {
        floorsCleared++;
        descents++;
        if (e.floor >= 1 && e.floor <= 60) clearsByFloor[e.floor - 1]++;
        highestFloor = Math.max(highestFloor, e.floor);
        if (e.durationSec) timeInDungeonSec += e.durationSec;
        recent.push({
          type: "win",
          text: `Cleared Floor ${e.floor} — C${e.complexity} ${e.size}` +
            (e.durationSec ? ` in ${fmtDuration(e.durationSec)}` : ""),
          ts: e.ts,
        });
        break;
      }
      case "boss_killed": {
        bossKills.set(e.boss, (bossKills.get(e.boss) ?? 0) + 1);
        recent.push({ type: "win", text: `Felled ${e.boss}`, ts: e.ts });
        break;
      }
      case "drop": {
        const existing = dropMap.get(e.item);
        if (existing) existing.count++;
        else dropMap.set(e.item, { rarity: e.rarity, count: 1, firstSeen: e.ts });
        recent.push({ type: "drop", text: `Found ${e.item}`, ts: e.ts });
        break;
      }
      case "death": {
        deaths++;
        lastDeath = { floor: e.floor, cause: e.cause };
        recent.push({
          type: "death",
          text: `Died${e.floor ? ` on Floor ${e.floor}` : ""}${e.cause ? ` to ${e.cause}` : ""}`,
          ts: e.ts,
        });
        break;
      }
      case "xp_sample": {
        dungeoneeringXp = e.dungeoneeringXp;
        totalXp = e.totalXp;
        break;
      }
    }
  }

  const bosses = [...bossKills.entries()]
    .map(([name, kills]) => ({ name, kills }))
    .sort((a, b) => b.kills - a.kills);

  const drops = [...dropMap.entries()]
    .map(([item, d]) => ({ item, ...d }))
    .sort((a, b) => b.firstSeen - a.firstSeen);

  recent.sort((a, b) => b.ts - a.ts);

  return {
    player,
    updatedAt: Date.now(),
    dungeoneering: { level: dungeoneeringXp ? xpToLevel(dungeoneeringXp) : 1, xp: dungeoneeringXp },
    highestFloor,
    totalFloors: 60,
    floorsCleared,
    descents,
    deaths,
    lastDeath,
    timeInDungeonSec,
    clearsByFloor,
    bosses,
    drops,
    recent: recent.slice(0, 25),
  };
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
