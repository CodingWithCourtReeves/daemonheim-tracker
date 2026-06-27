/**
 * @daemonheim/shared
 *
 * The single source of truth for the event contract that flows:
 *   Alt1 app  ──(POST /ingest)──►  API  ──(GET /stats)──►  dashboard
 *
 * Keep this package dependency-free so every workspace can import it cheaply.
 */

/** Daemonheim floor themes, used for tinting the depth gauge + histogram. */
export type FloorTheme =
  | "frozen" // 1–11
  | "abandoned" // 12–17, 30–35
  | "furnished" // 18–29
  | "occult" // 36–47
  | "warped"; // 48–60

export function themeForFloor(floor: number): FloorTheme {
  if (floor <= 11) return "frozen";
  if (floor <= 17) return "abandoned";
  if (floor <= 29) return "furnished";
  if (floor <= 35) return "abandoned";
  if (floor <= 47) return "occult";
  return "warped";
}

export type Complexity = 1 | 2 | 3 | 4 | 5 | 6;
export type DungeonSize = "small" | "medium" | "large";

/** A single RS3 skill: its hiscores/RuneMetrics id, display name, and level cap. */
export interface SkillMeta {
  id: number;
  name: string;
  /** Native level cap: 99, 110 (reworked gathering/artisan), or 120. */
  cap: number;
}

/**
 * All 29 RS3 skills in the in-game stats-interface reading order (3 columns,
 * row by row), so a 3-wide grid reproduces the familiar layout. Caps reflect
 * the current game (gathering/artisan skills are 110; combat + several others 120).
 * NOTE: column order is the long-standing arrangement — eyeball it against the
 * live stats panel and tweak if Jagex has since reshuffled.
 */
export const SKILLS: SkillMeta[] = [
  { id: 0, name: "Attack", cap: 120 },
  { id: 3, name: "Constitution", cap: 99 },
  { id: 14, name: "Mining", cap: 110 },
  { id: 2, name: "Strength", cap: 120 },
  { id: 16, name: "Agility", cap: 99 },
  { id: 13, name: "Smithing", cap: 110 },
  { id: 1, name: "Defence", cap: 99 },
  { id: 15, name: "Herblore", cap: 120 },
  { id: 10, name: "Fishing", cap: 99 },
  { id: 4, name: "Ranged", cap: 120 },
  { id: 17, name: "Thieving", cap: 99 },
  { id: 7, name: "Cooking", cap: 99 },
  { id: 5, name: "Prayer", cap: 99 },
  { id: 12, name: "Crafting", cap: 110 },
  { id: 11, name: "Firemaking", cap: 110 },
  { id: 6, name: "Magic", cap: 120 },
  { id: 9, name: "Fletching", cap: 110 },
  { id: 8, name: "Woodcutting", cap: 110 },
  { id: 20, name: "Runecrafting", cap: 110 },
  { id: 18, name: "Slayer", cap: 120 },
  { id: 19, name: "Farming", cap: 120 },
  { id: 22, name: "Construction", cap: 99 },
  { id: 21, name: "Hunter", cap: 99 },
  { id: 27, name: "Archaeology", cap: 120 },
  { id: 23, name: "Summoning", cap: 99 },
  { id: 25, name: "Divination", cap: 99 },
  { id: 26, name: "Invention", cap: 120 },
  { id: 24, name: "Dungeoneering", cap: 120 },
  { id: 28, name: "Necromancy", cap: 120 },
];

/** id → SkillMeta, for quick lookups when mapping RuneMetrics samples. */
export const SKILL_BY_ID: Record<number, SkillMeta> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
);

/** Display name for a skill id, or the id as a string if unknown. */
export function skillName(id: number): string {
  return SKILL_BY_ID[id]?.name ?? String(id);
}

/**
 * Every meaningful thing the Alt1 app observes becomes one of these events.
 * The store is append-only: events are never mutated, stats are derived.
 */
export type TrackerEvent =
  | FloorCompletedEvent
  | BossKilledEvent
  | DropEvent
  | DeathEvent
  | XpSampleEvent;

interface BaseEvent {
  /** Client-generated UUID so re-sends are idempotent (API dedupes on this). */
  id: string;
  /** Unix ms, set by the Alt1 app at observation time. */
  ts: number;
  /** RSN this event belongs to. */
  player: string;
}

export interface FloorCompletedEvent extends BaseEvent {
  type: "floor_completed";
  floor: number;
  complexity: Complexity;
  size: DungeonSize;
  /** Seconds spent on the floor, if the timer was read. */
  durationSec?: number;
  /** Percent explored, 0–100, if read. */
  explored?: number;
}

export interface BossKilledEvent extends BaseEvent {
  type: "boss_killed";
  boss: string;
  floor?: number;
}

export interface DropEvent extends BaseEvent {
  type: "drop";
  item: string;
  /** Coarse rarity bucket for dashboard styling; the reader guesses, you curate. */
  rarity?: "common" | "uncommon" | "rare" | "chaotic";
  floor?: number;
}

export interface DeathEvent extends BaseEvent {
  type: "death";
  floor?: number;
  cause?: string;
}

/** One skill's state at sample time, straight from RuneMetrics (id/level/xp). */
export interface SkillSample {
  id: number;
  level: number;
  xp: number;
}

/**
 * Periodic snapshot of skill XP, sourced from the RuneMetrics profile endpoint
 * (or Alt1's "Get game state" permission). Carries the full per-skill array plus
 * account-wide figures RuneMetrics already computes, so the dashboard never has
 * to re-derive level/combat from raw xp.
 */
export interface XpSampleEvent extends BaseEvent {
  type: "xp_sample";
  dungeoneeringXp: number;
  totalXp: number;
  /** Total level (RuneMetrics `totalskill`). */
  totalLevel?: number;
  /** Combat level (RuneMetrics `combatlevel`). */
  combatLevel?: number;
  /** Overall account rank (RuneMetrics `rank`). */
  rank?: number;
  /** Per-skill level + xp for every skill. */
  skills?: SkillSample[];
}

/** Omit that distributes over a union, so each member keeps its own fields. */
export type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Omit<T, K>
  : never;

/** What a reader passes to emit(): an event minus the fields the sender fills in. */
export type EventInput = DistributiveOmit<TrackerEvent, "id" | "ts" | "player">;

/** One skill row the dashboard renders in the in-game-style grid. */
export interface SkillStat {
  id: number;
  name: string;
  level: number;
  xp: number;
  cap: number;
}

/** A notable moment in the run, for the milestone timeline. */
export interface Milestone {
  type: "level" | "boss_first" | "deepest" | "death";
  text: string;
  ts: number;
}

/** A downsampled progress point for the growth charts. */
export interface HistoryPoint {
  ts: number;
  totalXp: number;
  dungXp: number;
  dungLevel: number;
}

/** Shape returned by GET /stats — exactly what the dashboard renders. */
export interface DashboardStats {
  player: string;
  updatedAt: number;
  dungeoneering: { level: number; xp: number; rank?: number };
  /** Account-wide figures (the right half of the split hero). */
  account: { totalLevel: number; totalXp: number; combatLevel: number; rank?: number };
  /** Every skill, in in-game grid order, for the skills panel. */
  skills: SkillStat[];
  /** Skills that leveled between the two most recent samples (drives the glow). */
  recentlyLeveled: { skill: string; from: number; to: number; ts: number }[];
  /** Downsampled XP/level series for the growth charts. */
  history: HistoryPoint[];
  /** Chronological journey feed. */
  milestones: Milestone[];
  highestFloor: number;
  totalFloors: number; // 60
  floorsCleared: number;
  descents: number;
  deaths: number;
  lastDeath?: { floor?: number; cause?: string };
  timeInDungeonSec: number;
  /** clears[floorIndex 0..59] = times that floor was cleared */
  clearsByFloor: number[];
  bosses: { name: string; kills: number }[];
  drops: { item: string; rarity?: string; count: number; firstSeen: number }[];
  recent: { type: string; text: string; ts: number }[];
}

/**
 * Convert total Dungeoneering XP to (virtual) level.
 *
 * Dungeoneering is a NORMAL skill (only Invention is elite), so it uses the
 * standard XP table: true mastery is level 120 at 104,273,167 XP. Virtual
 * levels continue past 120; the 200M XP cap lands at level 126 (level 127
 * needs 208,545,572 XP, which is unreachable), so 126 is the ceiling.
 */
export function xpToLevel(xp: number): number {
  let total = 0;
  for (let lvl = 1; lvl < 126; lvl++) {
    total += Math.floor(lvl + 300 * Math.pow(2, lvl / 7)) / 4;
    if (Math.floor(total) > xp) return lvl;
  }
  return 126;
}

/** Total XP required to reach `level` on the standard (non-elite) RS XP table. */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(i + 300 * Math.pow(2, i / 7));
  }
  return Math.floor(total / 4);
}
