import { bootstrap, captureClient, isAlt1, permissions } from "./alt1.js";
import { loadConfig, saveConfig, type AppConfig } from "./config.js";
import { EventSender } from "./events.js";
import { ChatReader } from "./readers/chat.js";
import { FloorReader } from "./readers/floor.js";
import { XpReader } from "./readers/xp.js";

// Your hosted appconfig.json URL once deployed (GitHub Pages). Used for identity.
const APP_URL = "https://codingwithcourtreeves.github.io/daemonheim-tracker/alt1/appconfig.json";

let cfg = loadConfig();
let sender = new EventSender(cfg);
let chat = new ChatReader(sender);
let floor = new FloorReader(sender);
let xp = new XpReader(sender, cfg.player);

function rebuild() {
  cfg = loadConfig();
  sender = new EventSender(cfg);
  chat = new ChatReader(sender);
  floor = new FloorReader(sender);
  xp = new XpReader(sender, cfg.player);
}

let running = false;
function loop() {
  if (running) return;
  running = true;
  const tick = () => {
    try {
      const img = captureClient();
      if (img) {
        chat.read(img);
        floor.read(img);
      }
      void xp.maybeSample();
    } catch (err) {
      console.warn("[daemonheim] tick error", err);
    }
    updateDebug();
    setTimeout(tick, cfg.pollMs);
  };
  tick();
}

// ---- UI ----------------------------------------------------------------
function render() {
  const app = document.getElementById("app");
  if (!app) return;
  const perm = isAlt1() ? permissions() : { pixel: false, gamestate: false };
  app.innerHTML = `
    <h1>Daemonheim Tracker</h1>
    <p class="status">
      Alt1: <b class="${isAlt1() ? "ok" : "bad"}">${isAlt1() ? "detected" : "open this in Alt1"}</b> ·
      screen: <b class="${perm.pixel ? "ok" : "bad"}">${perm.pixel ? "granted" : "grant pixel permission"}</b>
    </p>
    <form id="cfg">
      <label>Player (RSN)<input name="player" value="${cfg.player}"></label>
      <label>API base<input name="apiBase" value="${cfg.apiBase}"></label>
      <label>Ingest key<input name="ingestKey" value="${cfg.ingestKey}" type="password"></label>
      <button type="submit">Save & restart readers</button>
    </form>
    <p class="hint">Reads the screen only — no input is ever sent to the game.</p>
    <div id="debug" class="debug"></div>
  `;
  (app.querySelector("#cfg") as HTMLFormElement).addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    saveConfig({
      player: String(fd.get("player")),
      apiBase: String(fd.get("apiBase")),
      ingestKey: String(fd.get("ingestKey")),
    } as Partial<AppConfig>);
    rebuild();
    render();
  });
  updateDebug();
}

/** Live diagnostics so we can calibrate chat detection without a dev console. */
function updateDebug() {
  const el = document.getElementById("debug");
  if (!el) return;
  const perm = isAlt1() ? permissions() : { pixel: false, gamestate: false };
  const lines = chat.recentLines;
  const last = sender.lastSent as any;
  el.innerHTML = `
    <div class="dh">Diagnostics</div>
    <div>chatbox: <b class="${chat.isLocated ? "ok" : "bad"}">${chat.isLocated ? "locked on" : "searching…"}</b>
      · screen: <b class="${perm.pixel ? "ok" : "bad"}">${perm.pixel ? "ok" : "no"}</b></div>
    <div>events sent: <b>${sender.sentCount}</b>${sender.lastError ? ` · <span class="bad">${esc(sender.lastError)}</span>` : ""}</div>
    ${last ? `<div>last sent: <b>${esc(last.type)}</b> ${esc(last.boss || last.item || last.cause || "")}</div>` : ""}
    <div class="dh">Recent chat read (${lines.length})</div>
    <div class="lines">${lines.length ? lines.map((l) => `<div>${esc(l)}</div>`).join("") : "<i>nothing yet — make sure the chatbox is visible on screen</i>"}</div>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

bootstrap(APP_URL);
render();
loop();
