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
    <p class="hint">Reads the screen only — no input is ever sent to the game.
    Boss / drop / death tracking works now; floor detection activates once you
    calibrate the panel regions (see readers/floor.ts).</p>
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
}

bootstrap(APP_URL);
render();
loop();
