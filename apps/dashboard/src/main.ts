import {
  type DashboardStats,
  themeForFloor,
  xpToLevel,
} from "@daemonheim/shared";

// Point this at your deployed API. Override with ?api=... for testing.
const params = new URLSearchParams(location.search);
const API = params.get("api") ?? "http://localhost:4000";
const PLAYER = params.get("player") ?? "Daemonbound";
const REFRESH_MS = 60_000;

// ───────────────────────────────────────────────────────────────────────────
// EDIT ME: your channel, your invite, and the rules of the run.
// ───────────────────────────────────────────────────────────────────────────
const LINKS = {
  youtube: "https://youtube.com/@YOUR_CHANNEL", // ← your channel URL
  discord: "https://discord.gg/YOUR_INVITE", // ← your Discord invite
};

const CREED = {
  title: "The Pact",
  intro:
    "One account. One skill. One way down. The self-imposed rules of a Daemonheim-only Ironman — broadcast in full so nothing is hidden.",
  rules: [
    "<b>Ironman, always.</b> No trades, no help, no Grand Exchange. Everything is earned alone.",
    "<b>Daemonheim is the whole world.</b> Every point of XP must be gained inside a dungeon — no skilling, questing, or bossing on the surface.",
    "<b>Down in order.</b> Each floor is cleared before the next opens. No skipping the climb in depth or complexity.",
    "<b>Tokens stay home.</b> Dungeoneering reward tokens are spent only on Dungeoneering rewards.",
    "<b>Every fall is counted.</b> Deaths are logged here in full view — no quiet retries.",
    "<b>The goal:</b> Floor 60 at max complexity and Dungeoneering 120, then onward to 200M XP.",
  ],
};
// ───────────────────────────────────────────────────────────────────────────

const ICON = {
  yt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 4.9 12 4.9 12 4.9s-7 0-8.9.5A3 3 0 0 0 1 7.5 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.5ZM9.75 15.5v-7l6 3.5-6 3.5Z"/></svg>`,
  dc: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.27 5.33A16.5 16.5 0 0 0 15.4 4l-.24.43a13 13 0 0 1 3.2 1.13 12.6 12.6 0 0 0-10.7 0A13 13 0 0 1 10.85 4.4L10.6 4a16.5 16.5 0 0 0-3.87 1.33C3.6 9.5 3 13.6 3.2 17.6a16.6 16.6 0 0 0 4.9 2.5l.4-.6c-.66-.25-1.3-.56-1.9-.93l.47-.36a11.8 11.8 0 0 0 9.86 0l.47.36c-.6.37-1.24.68-1.9.93l.4.6a16.6 16.6 0 0 0 4.9-2.5c.3-4.6-.6-8.7-2.95-12.27ZM9.7 15.3c-.95 0-1.74-.88-1.74-1.96 0-1.08.77-1.96 1.74-1.96s1.76.89 1.74 1.96c0 1.08-.78 1.96-1.74 1.96Zm4.6 0c-.95 0-1.74-.88-1.74-1.96 0-1.08.77-1.96 1.74-1.96s1.76.89 1.74 1.96c0 1.08-.77 1.96-1.74 1.96Z"/></svg>`,
};

const THEME_VAR: Record<string, string> = {
  frozen: "var(--t-frozen)",
  abandoned: "var(--t-abandoned)",
  furnished: "var(--t-furnished)",
  occult: "var(--t-occult)",
  warped: "var(--ash-faint)",
};

async function fetchStats(): Promise<{ stats: DashboardStats; live: boolean }> {
  try {
    const res = await fetch(`${API}/stats/${encodeURIComponent(PLAYER)}`);
    if (!res.ok) throw new Error(String(res.status));
    const stats = (await res.json()) as DashboardStats;
    if (stats.floorsCleared > 0 || stats.dungeoneering.xp > 0) return { stats, live: true };
    return { stats: demo(), live: false }; // empty store → show demo so the page isn't blank
  } catch {
    return { stats: demo(), live: false };
  }
}

function render(stats: DashboardStats, live: boolean) {
  document.getElementById("rsn")!.textContent = stats.player;
  document.getElementById("banner")!.textContent = live
    ? ""
    : "Demo data — no live events yet. Run the API + Alt1 app, then this fills in.";

  const lvl = stats.dungeoneering.level || (stats.dungeoneering.xp ? xpToLevel(stats.dungeoneering.xp) : 1);
  document.getElementById("topstats")!.innerHTML = `
    <div class="tstat"><div class="k">Dungeoneering</div><div class="v"><em>${lvl}</em></div></div>
    <div class="tstat"><div class="k">Total XP</div><div class="v">${abbr(stats.dungeoneering.xp)}</div></div>
    ${stats.dungeoneering.rank ? `<div class="tstat"><div class="k">Rank</div><div class="v">#${stats.dungeoneering.rank.toLocaleString()}</div></div>` : ""}
  `;

  // depth gauge
  const track = document.getElementById("track")!;
  track.innerHTML = "";
  const band = document.createElement("div");
  band.className = "band";
  for (let f = 1; f <= stats.totalFloors; f++) {
    const d = document.createElement("div");
    d.className = "floor" + (f === stats.highestFloor ? " current" : "");
    if (f < stats.highestFloor) d.style.background = `linear-gradient(90deg, ${THEME_VAR[themeForFloor(f)]}, var(--rune))`;
    else if (f === stats.highestFloor) d.style.background = "var(--rune)";
    band.appendChild(d);
  }
  track.appendChild(band);
  document.getElementById("depthNum")!.textContent = String(stats.highestFloor);

  // main column
  const col = document.getElementById("col")!;
  col.innerHTML = "";
  col.appendChild(hero(stats));
  col.appendChild(trio(stats));
  col.appendChild(histogram(stats));
  col.appendChild(duo(stats));
  col.appendChild(feed(stats));
}

function hero(s: DashboardStats): HTMLElement {
  const theme = themeForFloor(s.highestFloor);
  const el = panel("hero");
  el.innerHTML = `
    <div>
      <div class="eyebrow">Deepest descent</div>
      <h2>Floor ${s.highestFloor} <small>/ ${s.totalFloors}</small></h2>
      <div class="note">Currently in the <b>${cap(theme)}</b> floors.</div>
    </div>`;
  return el;
}

function trio(s: DashboardStats): HTMLElement {
  const el = panel();
  el.innerHTML = `<div class="ptitle">The toll</div>
    <div class="trio">
      <div class="stat cleared"><div class="lab">Floors cleared</div><div class="big">${s.floorsCleared.toLocaleString()}</div><div class="meta">across ${s.descents.toLocaleString()} descents</div></div>
      <div class="stat time"><div class="lab">Time in Daemonheim</div><div class="big">${Math.floor(s.timeInDungeonSec / 3600)}h</div><div class="meta">${Math.floor((s.timeInDungeonSec % 3600) / 60)}m logged</div></div>
      <div class="stat death"><div class="lab">Deaths</div><div class="big">${s.deaths}</div><div class="meta">${s.lastDeath?.floor ? `last: Floor ${s.lastDeath.floor}` : "no falls logged"}</div></div>
    </div>`;
  return el;
}

function histogram(s: DashboardStats): HTMLElement {
  const el = panel();
  const max = Math.max(1, ...s.clearsByFloor);
  const bars = s.clearsByFloor
    .map((c, i) => {
      const f = i + 1;
      const h = c === 0 ? 2 : Math.max(6, (c / max) * 100);
      const bg = c === 0 ? "var(--stone-raised)" : THEME_VAR[themeForFloor(f)];
      const op = c === 0 ? ".4" : ".9";
      return `<div class="bar" style="height:${h}%;background:${bg};opacity:${op}"><div class="tip">Floor ${f} · ${c === 0 ? "not reached" : `cleared ${c}×`}</div></div>`;
    })
    .join("");
  el.innerHTML = `<div class="ptitle">Floors cleared, by depth</div>
    <div class="histo">${bars}</div>
    <div class="axis"><span>Floor 1</span><span>15</span><span>30</span><span>45</span><span>60</span></div>`;
  return el;
}

function duo(s: DashboardStats): HTMLElement {
  const el = document.createElement("div");
  el.className = "duo";
  const maxK = Math.max(1, ...s.bosses.map((b) => b.kills));
  const bossRows = s.bosses
    .map((b) => `<div class="brow"><span class="name">${b.name}</span><span class="meter"><i style="width:${(b.kills / maxK) * 100}%"></i></span><span class="cnt">${b.kills}</span></div>`)
    .join("") || `<div class="brow"><span class="name" style="color:var(--ash-faint)">No bosses logged yet</span></div>`;
  const dropCells = s.drops
    .map((d) => `<div class="drop"><div class="dn">${d.item}</div><div class="rar">${d.rarity ?? "drop"}</div><div class="cnt">×${d.count}</div></div>`)
    .join("") || `<div class="drop"><div class="dn" style="color:var(--ash-faint)">Nothing notable yet</div></div>`;

  const left = panel();
  left.innerHTML = `<div class="ptitle">Bosses felled</div>${bossRows}`;
  const right = panel();
  right.innerHTML = `<div class="ptitle">Notable finds</div><div class="drops">${dropCells}</div>`;
  el.appendChild(left);
  el.appendChild(right);
  return el;
}

function feed(s: DashboardStats): HTMLElement {
  const el = panel();
  const items = s.recent
    .map((r) => `<div class="fitem"><div class="fmark ${r.type}"></div><div class="fbody"><div class="txt">${r.text}</div><div class="when">${ago(r.ts)}</div></div></div>`)
    .join("") || `<div class="fitem"><div class="fbody"><div class="txt" style="color:var(--ash-faint)">No descents logged yet</div></div></div>`;
  el.innerHTML = `<div class="ptitle">Recent descents</div><div class="feed">${items}</div>`;
  return el;
}

function panel(extra = ""): HTMLElement {
  const el = document.createElement("section");
  el.className = "panel" + (extra ? " " + extra : "");
  return el;
}

function abbr(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
function cap(s: string): string { return s[0].toUpperCase() + s.slice(1); }
function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Demo stats so the page renders before any real events exist. */
function demo(): DashboardStats {
  const clears = new Array(60).fill(0).map((_, i) => {
    const f = i + 1;
    if (f > 47) return 0;
    let v = Math.round(70 * Math.exp(-Math.pow((f - 22) / 16, 2)) + 8);
    if (f === 35) v = 96;
    return v;
  });
  const now = Date.now();
  return {
    player: PLAYER, updatedAt: now,
    dungeoneering: { level: 120, xp: 118_400_000, rank: 1980 },
    highestFloor: 47, totalFloors: 60, floorsCleared: 1284, descents: 1041,
    deaths: 3, lastDeath: { floor: 44, cause: "Yk'Lagor the Thunderous" },
    timeInDungeonSec: 847 * 3600 + 12 * 60, clearsByFloor: clears,
    bosses: [
      { name: "Gluttonous behemoth", kills: 142 }, { name: "Astea Frostweb", kills: 98 },
      { name: "Icy Bones", kills: 76 }, { name: "Rammernaut", kills: 58 },
      { name: "To'Kash the Bloodchiller", kills: 51 }, { name: "Yk'Lagor the Thunderous", kills: 33 },
    ],
    drops: [
      { item: "Chaotic rapier", rarity: "chaotic", count: 1, firstSeen: now - 9e6 },
      { item: "Gravite 2h", rarity: "rare", count: 2, firstSeen: now - 2e7 },
      { item: "Chaotic remnant", rarity: "rare", count: 4, firstSeen: now - 3e6 },
    ],
    recent: [
      { type: "win", text: "Cleared Floor 47 — C6 Large in 18m 42s", ts: now - 7e5 },
      { type: "drop", text: "Found Chaotic remnant", ts: now - 25e5 },
      { type: "death", text: "Died on Floor 44 to Yk'Lagor the Thunderous", ts: now - 18e6 },
    ],
  };
}

/** Header links + the rules section are static — render once, not on refresh. */
function renderStatic() {
  document.getElementById("links")!.innerHTML = `
    <a class="yt" href="${LINKS.youtube}" target="_blank" rel="noopener">${ICON.yt}<span>YouTube</span></a>
    <a class="dc" href="${LINKS.discord}" target="_blank" rel="noopener">${ICON.dc}<span>Discord</span></a>`;

  document.getElementById("creed")!.innerHTML = `
    <div class="eyebrow">Rules of the descent</div>
    <h2>${CREED.title}</h2>
    <p class="intro">${CREED.intro}</p>
    <ol class="tenets">
      ${CREED.rules.map((r, i) => `<li class="tenet"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="t">${r}</span></li>`).join("")}
    </ol>
    <div class="cta">
      <a class="yt" href="${LINKS.youtube}" target="_blank" rel="noopener">${ICON.yt} Watch the descent</a>
      <a class="dc" href="${LINKS.discord}" target="_blank" rel="noopener">${ICON.dc} Join the Discord</a>
    </div>`;
}

async function tick() {
  const { stats, live } = await fetchStats();
  render(stats, live);
}
renderStatic();
void tick();
setInterval(() => void tick(), REFRESH_MS);
