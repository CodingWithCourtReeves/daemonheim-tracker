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

/**
 * Periodic snapshot of skill XP, sourced from Alt1's "Get game state" permission
 * (cleaner than OCR) or the RuneMetrics profile endpoint as a fallback.
 */
export interface XpSampleEvent extends BaseEvent {
  type: "xp_sample";
  dungeoneeringXp: number;
  totalXp: number;
  /** Per-skill xp map, e.g. { attack: 1234, constitution: 5678, ... } */
  skills?: Record<string, number>;
}

/** Omit that distributes over a union, so each member keeps its own fields. */
export type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Omit<T, K>
  : never;

/** What a reader passes to emit(): an event minus the fields the sender fills in. */
export type EventInput = DistributiveOmit<TrackerEvent, "id" | "ts" | "player">;

/** Shape returned by GET /stats — exactly what the dashboard renders. */
export interface DashboardStats {
  player: string;
  updatedAt: number;
  dungeoneering: { level: number; xp: number; rank?: number };
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

/** Convert total Dungeoneering XP to (virtual) level. Elite skill, caps at 150. */
export function xpToLevel(xp: number): number {
  let total = 0;
  for (let lvl = 1; lvl < 150; lvl++) {
    total += Math.floor(lvl + 300 * Math.pow(2, lvl / 7)) / 4;
    if (Math.floor(total) > xp) return lvl;
  }
  return 150;
}
