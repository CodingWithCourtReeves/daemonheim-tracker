import {
  type DashboardStats,
  type SkillStat,
  SKILLS,
  themeForFloor,
  xpToLevel,
  xpForLevel,
} from "@daemonheim/shared";

// Point this at your deployed API. Override with ?api=... (e.g. http://localhost:4000 for dev).
const params = new URLSearchParams(location.search);
const API = params.get("api") ?? "https://api-production-34b9.up.railway.app";
const PLAYER = params.get("player") ?? "CourtMaxxing";
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
    "One account. One way down. A Dungeoneering-only Ironman — every scrap of XP earned beneath Daemonheim. The rules are self-imposed and broadcast in full, so nothing is hidden.",
  rules: [
    "<b>Ironman, always.</b> No trades, no help, no Grand Exchange. Everything is earned alone.",
    "<b>Daemonheim is the whole world.</b> Every point of XP — combat, prayer, all of it — is earned inside a dungeon. Nothing is trained on the surface.",
    "<b>Down in order.</b> Floors are taken in sequence — no skipping the climb, even now the remaster makes every floor worth running.",
    "<b>Tokens stay home.</b> Dungeoneering reward tokens are spent only on Dungeoneering rewards.",
    "<b>Every fall is counted.</b> Deaths are logged here in full view — no quiet retries.",
    "<b>The climb is the point.</b> Floor 60, Dungeoneering 120, 200M XP — milestones along the way, not a finish line. We go as deep as the run takes us.",
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
    // Any real signal — even a brand-new account (total level > 0) — is live data.
    if (stats.floorsCleared > 0 || stats.dungeoneering.xp > 0 || stats.account.totalLevel > 0)
      return { stats, live: true };
    return { stats: demo(), live: false }; // truly empty store → show demo so the page isn't blank
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

  // depth gauge — circular minimap-style ring
  document.getElementById("track")!.innerHTML = gaugeRing(stats);

  // main column
  const col = document.getElementById("col")!;
  col.innerHTML = "";
  col.appendChild(hero(stats));
  col.appendChild(skillsPanel(stats));
  col.appendChild(trio(stats));
  col.appendChild(charts(stats));
  col.appendChild(histogram(stats));
  col.appendChild(duo(stats));
  col.appendChild(timeline(stats));
}

// ── Circular depth gauge: 60 floor ticks around a ring, nodding to the new
//    classic circular minimap. Center shows the deepest floor reached. ────────
function gaugeRing(s: DashboardStats): string {
  const N = s.totalFloors;
  const cx = 50, cy = 50, rIn = 37, rOut = 46;
  const ticks = Array.from({ length: N }, (_, i) => {
    const f = i + 1;
    const ang = ((-90 + (i / N) * 360) * Math.PI) / 180; // start at top, clockwise
    const x1 = cx + rIn * Math.cos(ang), y1 = cy + rIn * Math.sin(ang);
    const x2 = cx + rOut * Math.cos(ang), y2 = cy + rOut * Math.sin(ang);
    let color = "var(--stone-line)", w = 1.6, cls = "";
    if (f === s.highestFloor) { color = "var(--rune)"; w = 3; cls = ' class="gauge-cur"'; }
    else if (f < s.highestFloor) { color = THEME_VAR[themeForFloor(f)]; w = 2.2; }
    return `<line${cls} x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  }).join("");
  return `<svg viewBox="0 0 100 100" class="gauge-ring" role="img" aria-label="Deepest floor ${s.highestFloor} of ${N}">
    <circle cx="50" cy="50" r="41.5" fill="none" stroke="var(--stone-line)" stroke-width="0.5" opacity="0.35"/>
    ${ticks}
    <text x="50" y="51" text-anchor="middle" class="gr-num">${s.highestFloor}</text>
    <text x="50" y="62" text-anchor="middle" class="gr-of">OF ${N}</text>
  </svg>`;
}

// ── Split hero: the descent on the left, the whole account on the right ──────
function hero(s: DashboardStats): HTMLElement {
  const theme = themeForFloor(s.highestFloor || 1);
  const dungLevel = s.dungeoneering.level || 1;
  const dungXp = s.dungeoneering.xp;
  // progress bar: toward 120 while below it, then toward the 200M xp cap.
  const toCap = dungLevel < 120;
  const pct = toCap
    ? clampPct((dungXp / xpForLevel(120)) * 100)
    : clampPct((dungXp / 200_000_000) * 100);
  const nines = s.skills.filter((k) => k.level >= 99).length;
  const onetwenties = s.skills.filter((k) => k.level >= 120).length;

  const el = document.createElement("div");
  el.className = "hero-split";
  el.innerHTML = `
    <section class="panel hero">
      <div class="eyebrow">The descent</div>
      <h2>Floor ${s.highestFloor} <small>/ ${s.totalFloors}</small></h2>
      <div class="note">Currently in the <b>${cap(theme)}</b> floors · ${fmtHours(s.timeInDungeonSec)} in Daemonheim</div>
      <div class="bar-wrap">
        <div class="bar-row"><span>Dungeoneering ${dungLevel}</span><span>${toCap ? "→ 120" : "→ 200M"}</span></div>
        <div class="prog"><i style="width:${pct}%"></i></div>
      </div>
    </section>
    <section class="panel hero account">
      <div class="eyebrow">The account</div>
      <h2>${s.account.totalLevel.toLocaleString()} <small>total</small></h2>
      <div class="note">An entire account built <b>only from Dungeoneering</b>.</div>
      <div class="acct-grid">
        <div><div class="lab">Combat</div><div class="big">${s.account.combatLevel || "—"}</div></div>
        <div><div class="lab">Total XP</div><div class="big">${abbr(s.account.totalXp)}</div></div>
        <div><div class="lab">99s / 120s</div><div class="big">${nines}<span class="sub"> / ${onetwenties}</span></div></div>
      </div>
    </section>`;
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

// ── In-game-style skills panel: 3-col icon grid, tap-for-detail, level glow ──
function skillsPanel(s: DashboardStats): HTMLElement {
  const el = panel();
  const leveled = new Set(s.recentlyLeveled.map((r) => r.skill));
  const cells = s.skills
    .map((k) => {
      const file = k.name.toLowerCase();
      return `<button class="skill${leveled.has(k.name) ? " up" : ""}" data-id="${k.id}" title="${esc(k.name)}">
        <span class="ph">${esc(k.name.slice(0, 3))}</span>
        <img class="ic" src="skills/${file}.png" alt="${esc(k.name)}" loading="lazy" onerror="this.style.display='none'">
        <span class="lv">${k.level}</span>
      </button>`;
    })
    .join("");
  el.innerHTML = `
    <div class="ptitle">Skills <span class="ptag">Total level ${s.account.totalLevel.toLocaleString()}</span></div>
    <div class="skill-detail" id="skillDetail">Tap a skill for XP detail.</div>
    <div class="skillgrid">${cells}</div>`;

  const detail = el.querySelector<HTMLElement>("#skillDetail")!;
  const show = (k: SkillStat) => {
    const atCap = k.level >= k.cap;
    const next = atCap ? null : xpForLevel(k.level + 1) - k.xp;
    detail.innerHTML =
      `<b>${esc(k.name)}</b> · level ${k.level}<span class="muted">/${k.cap}</span> · ${k.xp.toLocaleString()} xp` +
      (next != null ? ` · <span class="muted">${next.toLocaleString()} to ${k.level + 1}</span>` : ` · <span class="muted">max</span>`);
  };
  el.querySelectorAll<HTMLElement>(".skill").forEach((btn) => {
    const k = s.skills.find((x) => x.id === Number(btn.dataset.id))!;
    btn.addEventListener("click", () => show(k));
    btn.addEventListener("mouseenter", () => show(k));
  });
  return el;
}

// ── Two growth charts with axes + hover/tap tooltips ─────────────────────────
function charts(s: DashboardStats): HTMLElement {
  const el = document.createElement("div");
  el.className = "duo";
  el.appendChild(chartPanel("Total XP over time", s.history, (h) => h.totalXp, "var(--rune)", (v) => abbr(v)));
  el.appendChild(chartPanel("Dungeoneering climb", s.history, (h) => h.dungLevel, "var(--torch)", (v) => String(v), 1, 120, "→ 120"));
  return el;
}

function chartPanel(
  title: string,
  history: DashboardStats["history"],
  getY: (h: DashboardStats["history"][number]) => number,
  color: string,
  fmtY: (v: number) => string,
  yMin?: number,
  yMax?: number,
  tag?: string,
): HTMLElement {
  const p = panel();
  p.innerHTML = `<div class="ptitle">${title}${tag ? ` <span class="ptag">${tag}</span>` : ""}</div>`;
  if (history.length < 2) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "Not enough data yet.";
    p.appendChild(empty);
  } else {
    p.appendChild(buildChart(history, getY, color, fmtY, yMin, yMax));
  }
  return p;
}

function buildChart(
  history: DashboardStats["history"],
  getY: (h: DashboardStats["history"][number]) => number,
  color: string,
  fmtY: (v: number) => string,
  yMin?: number,
  yMax?: number,
): HTMLElement {
  const W = 320, H = 150, x0 = 42, x1 = W - 10, y0 = 10, y1 = H - 22; // plot box
  const ys = history.map(getY);
  const minY = yMin ?? Math.min(...ys);
  const maxY = yMax ?? Math.max(...ys, minY + 1);
  const minX = history[0].ts, maxX = history[history.length - 1].ts;
  const n = history.length;
  const sx = (i: number) => x0 + (n === 1 ? 0 : i / (n - 1)) * (x1 - x0);
  const sy = (v: number) => y1 - ((v - minY) / (maxY - minY || 1)) * (y1 - y0);
  const path = history.map((h, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(getY(h)).toFixed(1)}`).join(" ");
  const area = `${path} L${sx(n - 1).toFixed(1)},${y1} L${sx(0).toFixed(1)},${y1} Z`;
  const yt = [minY, (minY + maxY) / 2, maxY];
  const grid = yt.map((v) => `<line x1="${x0}" y1="${sy(v).toFixed(1)}" x2="${x1}" y2="${sy(v).toFixed(1)}" class="grid"/>`).join("");
  const ylabels = yt.map((v) => `<text x="${x0 - 5}" y="${(sy(v) + 3).toFixed(1)}" class="ax yax">${fmtY(Math.round(v))}</text>`).join("");
  const xlabels = `<text x="${x0}" y="${H - 6}" class="ax">${shortDate(minX)}</text><text x="${x1}" y="${H - 6}" text-anchor="end" class="ax">${shortDate(maxX)}</text>`;

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  wrap.innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}">
      ${grid}
      <path d="${area}" fill="${color}" opacity="0.09"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="cursor" x1="0" y1="${y0}" x2="0" y2="${y1}" style="display:none"/>
      <circle class="cdot" r="3.2" fill="${color}" style="display:none"/>
      ${ylabels}${xlabels}
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="transparent" class="hit"/>
    </svg>
    <div class="ctip" style="display:none"></div>`;

  const svg = wrap.querySelector("svg")!;
  const cursor = wrap.querySelector<SVGLineElement>(".cursor")!;
  const dot = wrap.querySelector<SVGCircleElement>(".cdot")!;
  const tip = wrap.querySelector<HTMLElement>(".ctip")!;
  const move = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / W;
    const xv = (clientX - rect.left) / scale;
    let i = Math.round(((xv - x0) / (x1 - x0 || 1)) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    const px = sx(i), py = sy(getY(history[i]));
    cursor.setAttribute("x1", String(px)); cursor.setAttribute("x2", String(px)); cursor.style.display = "";
    dot.setAttribute("cx", String(px)); dot.setAttribute("cy", String(py)); dot.style.display = "";
    tip.style.display = "";
    tip.innerHTML = `<b>${esc(fmtY(getY(history[i])))}</b><span>${esc(shortDate(history[i].ts))}</span>`;
    tip.style.left = `${Math.max(0, Math.min(rect.width - 96, px * scale - 44))}px`;
    tip.style.top = `${Math.max(0, py * scale - 34)}px`;
  };
  svg.addEventListener("pointermove", (e) => move(e.clientX));
  svg.addEventListener("pointerdown", (e) => move(e.clientX));
  svg.addEventListener("pointerleave", () => { cursor.style.display = "none"; dot.style.display = "none"; tip.style.display = "none"; });
  return wrap;
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
}

// ── Milestone timeline: the journey feed, paginated (newest first) ───────────
const MILESTONES_PER_PAGE = 8;
let milestonePage = 0; // preserved across the 60s auto-refresh

function timeline(s: DashboardStats): HTMLElement {
  const el = panel();
  const all = s.milestones;
  const pages = Math.max(1, Math.ceil(all.length / MILESTONES_PER_PAGE));
  milestonePage = Math.max(0, Math.min(milestonePage, pages - 1));
  const mark: Record<string, string> = { level: "win", boss_first: "win", deepest: "drop", death: "death" };

  el.innerHTML = `<div class="ptitle">The journey so far</div><div class="feed"></div><div class="pager"></div>`;
  const feed = el.querySelector<HTMLElement>(".feed")!;
  const pager = el.querySelector<HTMLElement>(".pager")!;

  const draw = () => {
    const start = milestonePage * MILESTONES_PER_PAGE;
    const slice = all.slice(start, start + MILESTONES_PER_PAGE);
    feed.innerHTML = slice
      .map((m) => `<div class="fitem"><div class="fmark ${mark[m.type] ?? ""}"></div><div class="fbody"><div class="txt">${esc(m.text)}</div><div class="when">${ago(m.ts)}</div></div></div>`)
      .join("") || `<div class="fitem"><div class="fbody"><div class="txt" style="color:var(--ash-faint)">The journey hasn't begun — milestones appear here.</div></div></div>`;
    pager.innerHTML = pages <= 1 ? "" :
      `<button class="pg" data-d="-1" ${milestonePage === 0 ? "disabled" : ""}>‹ Newer</button>
       <span class="pgn">${milestonePage + 1} / ${pages}</span>
       <button class="pg" data-d="1" ${milestonePage >= pages - 1 ? "disabled" : ""}>Older ›</button>`;
  };

  pager.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".pg");
    if (!btn) return;
    milestonePage = Math.max(0, Math.min(pages - 1, milestonePage + Number(btn.dataset.d)));
    draw();
  });
  draw();
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
function clampPct(n: number): number { return Math.max(0, Math.min(100, n)); }
function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  return h >= 1 ? `${h.toLocaleString()}h` : `${Math.floor(sec / 60)}m`;
}
/** Escape game/chat-derived text before it goes into innerHTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
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
  // Plausible Dungeoneering-only account: combat/support high, pure gathering low.
  const demoLevels: Record<string, number> = {
    Attack: 99, Strength: 99, Defence: 99, Constitution: 99, Ranged: 96, Magic: 99,
    Prayer: 95, Summoning: 92, Necromancy: 90, Herblore: 88, Slayer: 84, Farming: 70,
    Dungeoneering: 120, Agility: 75, Thieving: 62, Crafting: 64, Fletching: 58,
    Runecrafting: 55, Construction: 52, Hunter: 60, Divination: 66, Invention: 40,
    Archaeology: 50, Mining: 45, Smithing: 48, Fishing: 42, Cooking: 47,
    Woodcutting: 44, Firemaking: 49,
  };
  const skills: SkillStat[] = SKILLS.map((m) => {
    const level = demoLevels[m.name] ?? 1;
    return { id: m.id, name: m.name, cap: m.cap, level, xp: xpForLevel(level) + 1 };
  });
  const totalLevel = skills.reduce((a, k) => a + k.level, 0);
  const totalXp = skills.reduce((a, k) => a + k.xp, 0);

  // ~30 points climbing from a fresh account to the present.
  const history = Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const dungXp = Math.round(118_400_000 * Math.pow(t, 1.4));
    return {
      ts: now - (29 - i) * 36e5,
      totalXp: Math.round(totalXp * Math.pow(t, 1.3)),
      dungXp,
      dungLevel: xpToLevel(dungXp),
    };
  });

  return {
    player: PLAYER, updatedAt: now,
    dungeoneering: { level: 120, xp: 118_400_000, rank: 1980 },
    account: { totalLevel, totalXp, combatLevel: 138, rank: 1980 },
    skills,
    recentlyLeveled: [{ skill: "Necromancy", from: 89, to: 90, ts: now - 4e5 }],
    history,
    milestones: [
      { type: "level", text: "Necromancy reached level 90", ts: now - 4e5 },
      { type: "deepest", text: "Reached Floor 47", ts: now - 7e5 },
      { type: "boss_first", text: "First Yk'Lagor the Thunderous kill", ts: now - 9e6 },
      { type: "death", text: "Died on Floor 44 to Yk'Lagor the Thunderous", ts: now - 18e6 },
      { type: "level", text: "Dungeoneering reached level 120", ts: now - 5e7 },
    ],
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
