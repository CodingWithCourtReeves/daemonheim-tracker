import {
  type TrackerEvent,
  type XpSampleEvent,
  type DashboardStats,
  type SkillStat,
  type Milestone,
  type HistoryPoint,
  SKILLS,
  skillName,
  xpToLevel,
} from "@daemonheim/shared";

/** Most points the history series will ever carry (downsampled past this). */
const MAX_HISTORY_POINTS = 200;
/** Most milestones returned to the dashboard timeline. */
const MAX_MILESTONES = 50;

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
  const milestones: Milestone[] = [];
  const history: HistoryPoint[] = [];
  const samples: XpSampleEvent[] = [];

  let highestFloor = 0;
  let floorsCleared = 0;
  let descents = 0;
  let deaths = 0;
  let lastDeath: DashboardStats["lastDeath"];
  let timeInDungeonSec = 0;
  let dungeoneeringXp = 0;
  let totalXp = 0;

  // running state for milestone detection
  let deepestSoFar = 0;
  const firstBossSeen = new Set<string>();
  let prevLevels: Map<number, number> | null = null;

  for (const e of sorted) {
    switch (e.type) {
      case "floor_completed": {
        floorsCleared++;
        descents++;
        if (e.floor >= 1 && e.floor <= 60) clearsByFloor[e.floor - 1]++;
        highestFloor = Math.max(highestFloor, e.floor);
        if (e.durationSec) timeInDungeonSec += e.durationSec;
        if (e.floor > deepestSoFar) {
          deepestSoFar = e.floor;
          milestones.push({ type: "deepest", text: `Reached Floor ${e.floor}`, ts: e.ts });
        }
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
        if (!firstBossSeen.has(e.boss)) {
          firstBossSeen.add(e.boss);
          milestones.push({ type: "boss_first", text: `First ${e.boss} kill`, ts: e.ts });
        }
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
        const text = `Died${e.floor ? ` on Floor ${e.floor}` : ""}${e.cause ? ` to ${e.cause}` : ""}`;
        milestones.push({ type: "death", text, ts: e.ts });
        recent.push({ type: "death", text, ts: e.ts });
        break;
      }
      case "xp_sample": {
        dungeoneeringXp = e.dungeoneeringXp;
        totalXp = e.totalXp;
        samples.push(e);
        history.push({
          ts: e.ts,
          totalXp: e.totalXp,
          dungXp: e.dungeoneeringXp,
          dungLevel: xpToLevel(e.dungeoneeringXp),
        });
        // level-up milestones: compare this sample's skill levels to the prior sample
        const levels = skillLevelMap(e);
        if (prevLevels) {
          for (const { id } of SKILLS) {
            const now = levels.get(id);
            const was = prevLevels.get(id);
            if (now != null && was != null && now > was) {
              milestones.push({ type: "level", text: `${skillName(id)} reached level ${now}`, ts: e.ts });
            }
          }
        }
        prevLevels = levels;
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
  milestones.sort((a, b) => b.ts - a.ts);

  const latest = samples.length ? samples[samples.length - 1] : undefined;

  // total XP: prefer the account-wide figure RuneMetrics reports; fall back to the
  // legacy single-number field carried by older/synthetic samples.
  const totalXpOut = latest?.totalXp ?? totalXp;

  return {
    player,
    updatedAt: Date.now(),
    dungeoneering: { level: dungeoneeringXp ? xpToLevel(dungeoneeringXp) : 1, xp: dungeoneeringXp },
    account: {
      totalLevel: latest?.totalLevel ?? 0,
      totalXp: totalXpOut,
      combatLevel: latest?.combatLevel ?? 0,
      rank: latest?.rank,
    },
    skills: buildSkillGrid(latest),
    recentlyLeveled: computeRecentlyLeveled(samples),
    history: downsample(history),
    milestones: milestones.slice(0, MAX_MILESTONES),
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

/** id → level for a sample's skills (empty if the sample carried none). */
function skillLevelMap(sample: XpSampleEvent): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of sample.skills ?? []) m.set(s.id, s.level);
  return m;
}

/** The full 29-skill grid in in-game order, filled from the latest sample. */
function buildSkillGrid(latest?: XpSampleEvent): SkillStat[] {
  const byId = new Map<number, { level: number; xp: number }>();
  for (const s of latest?.skills ?? []) byId.set(s.id, { level: s.level, xp: s.xp });
  return SKILLS.map((meta) => {
    const v = byId.get(meta.id);
    return { id: meta.id, name: meta.name, cap: meta.cap, level: v?.level ?? 1, xp: v?.xp ?? 0 };
  });
}

/** Skills whose level rose between the two most recent samples. */
function computeRecentlyLeveled(samples: XpSampleEvent[]): DashboardStats["recentlyLeveled"] {
  if (samples.length < 2) return [];
  const latest = skillLevelMap(samples[samples.length - 1]);
  const prev = skillLevelMap(samples[samples.length - 2]);
  const ts = samples[samples.length - 1].ts;
  const out: DashboardStats["recentlyLeveled"] = [];
  for (const { id } of SKILLS) {
    const now = latest.get(id);
    const was = prev.get(id);
    if (now != null && was != null && now > was) {
      out.push({ skill: skillName(id), from: was, to: now, ts });
    }
  }
  return out;
}

/** Evenly thin a series down to MAX_HISTORY_POINTS, always keeping the last point. */
function downsample(points: HistoryPoint[]): HistoryPoint[] {
  if (points.length <= MAX_HISTORY_POINTS) return points;
  const out: HistoryPoint[] = [];
  const last = points.length - 1;
  for (let i = 0; i < MAX_HISTORY_POINTS - 1; i++) {
    out.push(points[Math.floor((i * last) / (MAX_HISTORY_POINTS - 1))]);
  }
  out.push(points[last]);
  return out;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
