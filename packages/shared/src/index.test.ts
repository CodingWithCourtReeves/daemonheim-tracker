import { describe, expect, test } from "vitest";
import { xpToLevel, xpForLevel, themeForFloor, SKILLS } from "./index.js";

describe("xpToLevel", () => {
  // Dungeoneering is a NORMAL (non-elite) skill: standard XP table, true cap 120.
  test("level 1 at 0 xp", () => {
    expect(xpToLevel(0)).toBe(1);
  });

  test("level 99 at exactly 13,034,431 xp", () => {
    expect(xpToLevel(13_034_431)).toBe(99);
  });

  test("level 120 at exactly 104,273,167 xp (true mastery)", () => {
    expect(xpToLevel(104_273_167)).toBe(120);
  });

  test("200M xp is virtual level 126", () => {
    expect(xpToLevel(200_000_000)).toBe(126);
  });

  test("caps at 126 — never returns the elite-skill 150", () => {
    expect(xpToLevel(Number.MAX_SAFE_INTEGER)).toBe(126);
  });
});

describe("xpForLevel", () => {
  test("level 1 needs 0 xp", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  test("level 99 needs 13,034,431 xp", () => {
    expect(xpForLevel(99)).toBe(13_034_431);
  });

  test("level 120 needs 104,273,167 xp", () => {
    expect(xpForLevel(120)).toBe(104_273_167);
  });

  test("is the inverse of xpToLevel at boundaries", () => {
    expect(xpToLevel(xpForLevel(99))).toBe(99);
    expect(xpToLevel(xpForLevel(120))).toBe(120);
  });
});

describe("SKILLS metadata", () => {
  test("has all 29 RS3 skills", () => {
    expect(SKILLS).toHaveLength(29);
  });

  test("ids are unique and cover 0..28", () => {
    const ids = SKILLS.map((s) => s.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 29 }, (_, i) => i));
  });

  test("Dungeoneering is id 24 with cap 120", () => {
    const d = SKILLS.find((s) => s.id === 24);
    expect(d?.name).toBe("Dungeoneering");
    expect(d?.cap).toBe(120);
  });

  test("Necromancy is id 28 (newest skill)", () => {
    expect(SKILLS.find((s) => s.id === 28)?.name).toBe("Necromancy");
  });

  test("gathering/artisan skills reworked to cap 110", () => {
    for (const name of ["Mining", "Smithing", "Woodcutting", "Fletching", "Firemaking", "Runecrafting", "Crafting"]) {
      expect(SKILLS.find((s) => s.name === name)?.cap).toBe(110);
    }
  });
});

describe("themeForFloor", () => {
  // Web-verified Daemonheim theme ranges (post-remaster).
  test.each([
    [1, "frozen"],
    [11, "frozen"],
    [12, "abandoned"],
    [17, "abandoned"],
    [18, "furnished"],
    [29, "furnished"],
    [30, "abandoned"],
    [35, "abandoned"],
    [36, "occult"],
    [47, "occult"],
    [48, "warped"],
    [60, "warped"],
  ])("floor %i is %s", (floor, theme) => {
    expect(themeForFloor(floor)).toBe(theme);
  });
});
