# Daemonheim Chronicle — Dashboard Design

**Date:** 2026-06-27
**Status:** Approved (design); pending spec review before planning

## 1. Purpose & vision

A mobile-first, viewer-facing progress board for a **Dungeoneering-only Ironman**
RuneScape 3 series (YouTube + Twitch). The account is a fresh Ironman, self-locked
so that **all XP is earned inside Daemonheim dungeons** ("region locked" in the
creator's words — note RS3 has no literal region lock; this is a self-imposed rule).
Combat and support skills still rise, but only as a *side effect* of clearing floors.

The append-only event log is the **data-collection foundation**. The dashboard's job
is to surface, for viewers, both halves of the story:

1. **The descent** — how deep into Daemonheim the run has gone.
2. **The account** — an entire character growing from nothing, powered only by Dungeoneering.

The goal is intentionally open-ended: this is a "watch the journey" board, not a
"reach level X by date" tracker.

**Context:** built after **Dungeoneering Remastered** (released 2026-05-11). Game
mechanics and on-page copy must reflect the remastered skill.

## 2. Scope

### In scope
- New **split hero**: The Descent + The Account side by side (stacks on mobile).
- New **skills panel**: faithful in-game 3-column icon grid, tap-for-detail, recently-leveled glow.
- New **growth charts**: total XP over time, and the Dungeoneering climb to 120.
- New **milestone timeline**: chronological journey feed (replaces the generic "recent" feed).
- Extend the shared types and API `aggregate()` to expose the data these need (additive, no breakage).
- Accuracy fixes: correct `xpToLevel`; rewrite "The Pact" copy for the remaster.
- Keep all existing descent panels (depth gauge, the toll trio, per-floor histogram, bosses, drops).

### Out of scope (for this iteration)
- Live Alt1 reader calibration (floor reader pixel offsets, exact chat regexes). This
  needs a hands-on session at the creator's PC and is tracked as a later phase, not built blind.
- Deployment (GitHub Pages + API host). Tracked as a later phase.
- Authentication/admin UI changes, per-key rotation, and other API security extensions
  beyond what already exists.
- Additional charts beyond the two named (revisit once real data justifies them).

## 3. Architecture

Unchanged data flow:

```
Alt1 app ──POST /ingest──► API (append-only log + aggregate) ──GET /stats/:player──► dashboard
```

- **Stack stays the same:** vanilla TypeScript + Vite, no UI framework. Consistent with
  the current dashboard, light and fast on mobile.
- All new dashboard data is **derived** by `aggregate()` from the existing event log.
  The only new event content already exists (`xp_sample` carries the per-skill map);
  we are surfacing data we already collect, not adding new readers.
- **Mobile-first** is a hard constraint for every component. The current dashboard
  already has responsive breakpoints (~840px: depth gauge goes horizontal, grids
  collapse to one column); new components extend that approach and are verified at
  phone widths.

## 4. Data model changes (`packages/shared`)

All additions to `DashboardStats` are **additive** — existing fields and consumers
are untouched.

New fields:

- `account`: `{ totalLevel: number; totalXp: number; combatLevel: number }`
  - `combatLevel` is computed from skill levels using the RS3 combat-level formula
    (verify the exact formula against the wiki at build time, including Necromancy).
- `skills`: `Array<{ id: number; name: string; level: number; xp: number; rank?: number }>`
  - Full skill list in the in-game interface order, sourced from the latest `xp_sample`.
- `recentlyLeveled`: `Array<{ skill: string; from: number; to: number; ts: number }>`
  - Derived by diffing the two most recent `xp_sample` events. Drives the skills-panel glow.
- `history`: `Array<{ ts: number; totalXp: number; dungXp: number; dungLevel: number }>`
  - Downsampled time series derived from `xp_sample` events, for the two charts. Cap the
    point count (e.g. bucket to a sane resolution) so payloads stay small.
- `milestones`: `Array<{ type: "level" | "boss_first" | "deepest" | "death"; text: string; ts: number }>`
  - Derived from the event log: each level-up, first kill of each boss, each new
    deepest floor, each death — in chronological order.

Correctness fix:

- `xpToLevel()` comment + cap: Dungeoneering is a **normal** skill (only Invention is
  elite). True cap is **level 120 = 104,273,167 XP**; 200M XP ≈ virtual level **126**,
  not 150. The formula itself is the correct normal-skill formula and stays; fix the
  comment and change the loop cap from 150 to the normal-skill virtual ceiling (~126).

## 5. API changes (`services/api/aggregate.ts`)

`aggregate()` gains the derivations for the fields above:

- **account / skills**: read the latest `xp_sample`; map its `skills` record into the
  ordered skill array; compute total level (sum of levels), total XP (`totalXp` from
  the sample), and combat level.
- **recentlyLeveled**: compare the latest two `xp_sample` events; emit an entry for any
  skill whose level increased.
- **history**: fold `xp_sample` events into a downsampled series.
- **milestones**: single pass over the log producing level-ups (from xp samples),
  first-boss-kills (first `boss_killed` per boss name), new-deepest-floor (running max
  of `floor_completed`), and deaths.

No store/schema migration is required — these read the existing append-only log.

## 6. Dashboard layout (`apps/dashboard`)

Top to bottom; single column on phones, multi-column on wider screens:

1. **Brand bar** — RSN, "Dungeoneering-only Ironman · RS3", YouTube/Discord links (existing).
2. **Split hero** — *The Descent* (deepest floor + gauge, Dungeoneering level with a
   progress bar to 120, time in Daemonheim) beside *The Account* (total level, total XP,
   combat level, count of 99s/120s; framing copy: built only from Dungeoneering).
   Stacks vertically on mobile.
3. **Skills panel** — faithful RS3 skills-interface look: 3-column icon grid with current
   levels + total level. **Tap a skill** → XP, XP-to-next-level, rank. **Recently-leveled
   glow** on skills from `recentlyLeveled`. Skill icons bundled locally in dashboard assets.
4. **The toll** — floors cleared / time in Daemonheim / deaths (existing trio).
5. **Growth charts** — total XP over time; Dungeoneering level climb to 120. Lightweight,
   phone-friendly rendering (small inline SVG/canvas; no heavy chart dependency).
6. **Per-floor clears histogram** — existing.
7. **Bosses + drops** — existing duo.
8. **Milestone timeline** — chronological journey feed from `milestones`; replaces the
   generic "recent" feed.
9. **The Pact** — rules, rewritten for the post-remaster game (see §7); goal line softened
   to an open-ended framing.
10. **Footer** — existing.

The dashboard keeps its demo-data fallback so the page styles without a live API; demo
data is extended to populate the new sections (skills, history, milestones).

## 7. Copy / accuracy updates ("The Pact")

Rewrite the creed to match the remastered game and the open-ended goal:

- **Prestige removed** → the old progression framing must not reference prestige
  (remaster replaced it with a floor-buff system).
- **Tokens** now equal 20% of floor XP (if referenced).
- **Floor XP rebalanced** so all floors are viable at all levels — this tensions with a
  literal "never skip the climb" rule. Keep the self-imposed ordering rule if desired, but
  word it so it doesn't contradict current mechanics.
- **Goal line**: replace the fixed "Floor 60 + Dungeoneering 120 + 200M XP" goal with an
  open-ended framing, since the goal is intentionally undefined.
- Keep the accurate framing: every point of XP is earned inside a dungeon; combat/support
  skills rise as a consequence.

## 8. Data-source reality

- **Live with no calibration (all from RuneMetrics):** the skills panel, all levels/XP,
  total + combat level, both growth charts, recently-leveled glow, the account half of the
  hero, and level-up milestones.
- **Requires a live calibration session (creator at PC + Alt1):** floor completions
  (complexity/size/time/% explored), and exact boss/drop/death chat wording — especially
  because the remaster may have changed the in-game text. Until then the per-floor
  histogram, bosses, drops, descent timing, and their milestones populate only from
  whatever the (guessed) chat regexes happen to catch. This is a known, accepted phase
  boundary, not a defect.

## 9. Testing

- **Shared/API:** unit tests for the new `aggregate()` derivations (skills mapping,
  recently-leveled diff, history downsampling, milestone extraction) against synthetic
  event logs; a test pinning `xpToLevel` to known XP/level boundaries (e.g. 99 =
  13,034,431; 120 = 104,273,167).
- **Dashboard:** verify rendering with both demo and live-shaped data; manual mobile-width
  checks (≤420px and ~768px) for the split hero, skills grid, charts, and timeline.

## 10. Build phases

1. **Data layer** — shared types + `aggregate()` derivations + extended demo data + tests.
2. **Dashboard UI** — split hero → skills panel → charts → milestone timeline; mobile pass at each step.
3. **Accuracy pass** — `xpToLevel` fix + "The Pact" rewrite.
4. **Live calibration** (separate session, needs creator) — floor reader + chat regexes against the live client.
5. **Deploy** (later) — GitHub Pages for the two static sites + host the API.

Phases 1–3 are the core build addressed by the next implementation plan. Phases 4–5 are
tracked but handled separately.
