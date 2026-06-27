import { describe, expect, test } from "vitest";
import { aggregate } from "./aggregate.js";
import type { TrackerEvent } from "@daemonheim/shared";

const P = "Tester";
let idc = 0;
const id = () => `e${idc++}`;

function xp(
  ts: number,
  o: {
    dung: number;
    total: number;
    totalLevel?: number;
    combat?: number;
    rank?: number;
    skills?: { id: number; level: number; xp: number }[];
  },
): TrackerEvent {
  return {
    id: id(), ts, player: P, type: "xp_sample",
    dungeoneeringXp: o.dung, totalXp: o.total,
    totalLevel: o.totalLevel, combatLevel: o.combat, rank: o.rank, skills: o.skills,
  } as TrackerEvent;
}
const floor = (ts: number, f: number): TrackerEvent =>
  ({ id: id(), ts, player: P, type: "floor_completed", floor: f, complexity: 1, size: "small" } as TrackerEvent);
const boss = (ts: number, b: string): TrackerEvent =>
  ({ id: id(), ts, player: P, type: "boss_killed", boss: b } as TrackerEvent);
const death = (ts: number, f?: number): TrackerEvent =>
  ({ id: id(), ts, player: P, type: "death", floor: f } as TrackerEvent);

describe("aggregate — account & skills", () => {
  test("surfaces account figures + a full 29-skill grid from the latest sample", () => {
    const s = aggregate(P, [
      xp(1000, {
        dung: 13_034_431, total: 50_000_000, totalLevel: 1500, combat: 138, rank: 12345,
        skills: [{ id: 24, level: 99, xp: 13_034_431 }, { id: 0, level: 80, xp: 2_000_000 }],
      }),
    ]);
    expect(s.account).toMatchObject({ totalLevel: 1500, totalXp: 50_000_000, combatLevel: 138, rank: 12345 });
    expect(s.skills).toHaveLength(29);
    expect(s.skills.find((k) => k.id === 24)).toMatchObject({ name: "Dungeoneering", level: 99, xp: 13_034_431, cap: 120 });
    expect(s.skills.find((k) => k.id === 0)).toMatchObject({ name: "Attack", level: 80 });
  });

  test("empty store yields zeroed account and a default grid", () => {
    const s = aggregate(P, []);
    expect(s.account).toMatchObject({ totalLevel: 0, totalXp: 0, combatLevel: 0 });
    expect(s.skills).toHaveLength(29);
  });
});

describe("aggregate — recentlyLeveled", () => {
  test("flags skills whose level rose between the two latest samples", () => {
    const s = aggregate(P, [
      xp(1000, { dung: 1, total: 1, skills: [{ id: 24, level: 50, xp: 100 }, { id: 0, level: 70, xp: 700 }] }),
      xp(2000, { dung: 1, total: 1, skills: [{ id: 24, level: 52, xp: 120 }, { id: 0, level: 70, xp: 710 }] }),
    ]);
    expect(s.recentlyLeveled).toEqual([{ skill: "Dungeoneering", from: 50, to: 52, ts: 2000 }]);
  });

  test("is empty with a single sample", () => {
    const s = aggregate(P, [xp(1000, { dung: 1, total: 1, skills: [{ id: 24, level: 50, xp: 1 }] })]);
    expect(s.recentlyLeveled).toEqual([]);
  });
});

describe("aggregate — history", () => {
  test("one chronological point per sample, with derived Dungeoneering level", () => {
    const s = aggregate(P, [
      xp(2000, { dung: 13_034_431, total: 500 }),
      xp(1000, { dung: 0, total: 100 }),
    ]);
    expect(s.history).toEqual([
      { ts: 1000, totalXp: 100, dungXp: 0, dungLevel: 1 },
      { ts: 2000, totalXp: 500, dungXp: 13_034_431, dungLevel: 99 },
    ]);
  });

  test("downsamples to a bounded count, always keeping the last point", () => {
    const evs = Array.from({ length: 500 }, (_, i) => xp(1000 + i, { dung: i, total: i }));
    const s = aggregate(P, evs);
    expect(s.history.length).toBeLessThanOrEqual(200);
    expect(s.history.at(-1)).toMatchObject({ ts: 1499 });
  });
});

describe("aggregate — milestones", () => {
  test("extracts deepest-floor, first-boss, death, and level-up moments, newest first", () => {
    const s = aggregate(P, [
      xp(1000, { dung: 1, total: 1, skills: [{ id: 24, level: 1, xp: 0 }] }),
      floor(1100, 1),
      floor(1200, 2),
      floor(1150, 1),
      boss(1300, "Astea Frostweb"),
      boss(1400, "Astea Frostweb"),
      death(1500, 2),
      xp(1600, { dung: 1, total: 1, skills: [{ id: 24, level: 3, xp: 1 }] }),
    ]);
    const texts = s.milestones.map((m) => m.text);
    expect(s.milestones[0].ts).toBe(1600); // newest first
    expect(texts.some((t) => /Dungeoneering reached level 3/i.test(t))).toBe(true);
    expect(texts.some((t) => /first.*Astea Frostweb/i.test(t))).toBe(true);
    expect(texts.filter((t) => /Astea Frostweb/i.test(t))).toHaveLength(1);
    expect(texts.some((t) => /Floor 2/i.test(t))).toBe(true);
    expect(texts.some((t) => /died/i.test(t))).toBe(true);
    const ts = s.milestones.map((m) => m.ts);
    expect([...ts].sort((a, b) => b - a)).toEqual(ts);
  });
});
