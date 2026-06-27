# Daemonheim Tracker

A progress tracker for a **Dungeoneering-only Ironman** RuneScape 3 account, built
to run alongside a Twitch/YouTube series. Three parts in one monorepo:

| Workspace | What it is | Where it runs |
|---|---|---|
| `apps/alt1-app` | An **Alt1 Toolkit** overlay that reads the game screen (boss kills, drops, deaths, floor clears) and your XP, then posts events to the API. **Read-only — never sends input to the game.** | Inside Alt1, served as a static site (GitHub Pages) |
| `services/api` | A Fastify service that ingests events into an append-only log and serves aggregated stats. | Your host (Coolify/Hetzner, Railway, etc.) |
| `apps/dashboard` | The public companion site — the "Daemonheim Chronicle" dashboard viewers see. Reads stats from the API. | Static site (GitHub Pages) |
| `packages/shared` | The event + stats type contract shared by all three. | — |

```
Alt1 app ──POST /ingest──► API ──GET /stats/:player──► dashboard
 (reads screen)         (append-only log + aggregate)   (public view)
```

## Why this design

- **Append-only events, derived stats.** The API never mutates data; `aggregate()`
  folds the whole event log into the dashboard shape. Replaying is deterministic and
  you can change how stats are computed without losing history.
- **Idempotent ingest.** Every event carries a UUID; re-sends are deduped, so the
  Alt1 app can retry freely during a flaky stream connection.
- **Screen-reading only.** No mouse/keyboard automation anywhere. That's the line
  that keeps this clear of Jagex's Macroing & Third-Party Software rule. Don't add
  input simulation — it would move the project into ban territory. Alt1 itself is
  tolerated-but-not-formally-endorsed by Jagex; you use it at your own risk.

## Quickstart (local dev)

Requires Node 20+.

```bash
npm install
npm run build:shared        # the other packages import its compiled output

# terminal 1 — API (writes to services/api/data/events.json)
npm run dev:api

# terminal 2 — dashboard (open the printed URL; shows demo data until events exist)
npm run dev:dashboard

# terminal 3 — Alt1 app (only fully works launched inside Alt1, but dev-serves fine)
npm run dev:alt1
```

The dashboard falls back to demo data when the API is empty or unreachable, so you
can style it without the game running. Point it at a real API with
`?api=https://your-api&player=YourRSN` in the URL.

## Deploy

### 1. Push to GitHub

```bash
git remote add origin git@github.com:YOUR_USER/daemonheim-tracker.git
git push -u origin main
```

### 2. Static sites → GitHub Pages

Both `apps/alt1-app` and `apps/dashboard` build to static `dist/` folders. Easiest
path is a GitHub Actions workflow that builds and publishes each to Pages (or a
branch like `gh-pages`). After building:

- Set the Alt1 app's `base` in `apps/alt1-app/vite.config.ts` if it's served from a
  subpath, and update `APP_URL` in `apps/alt1-app/src/main.ts` to the deployed
  `appconfig.json` URL.
- Set the dashboard's API target via the `?api=` param or hard-code `API` in
  `apps/dashboard/src/main.ts`.

### 3. API → your host

The API is a standard Node service. On Coolify/Hetzner or Railway:

```bash
npm run build -w @daemonheim/api
node services/api/dist/server.js
```

Set env from `services/api/.env.example` — **generate an `INGEST_KEY`** (`openssl
rand -hex 24`) and put the same value in the Alt1 app settings, or randoms can post
fake stats. Swap the JSON file store for Postgres for production (see below).

### 4. Install the Alt1 app

Once the Alt1 app is hosted, install it into Alt1 with its add-app link:

```
alt1://addapp/https://YOUR_USER.github.io/daemonheim-tracker/appconfig.json
```

Open it in Alt1, grant **screen** + **game state** permissions, and fill in your
RSN, the API base, and the ingest key in the app's settings form.

## What works now vs. what needs calibration

**Works immediately:**
- API ingest/dedupe/aggregate and the `/stats` endpoint (smoke-tested).
- Dashboard rendering (gauge, hero, histogram, bosses, drops, feed) with demo + live data.
- XP sampling via the RuneMetrics profile endpoint (`readers/xp.ts`) — needs the
  account's RuneMetrics privacy set to **public** in-game.
- Chat-based boss / drop / death detection (`readers/chat.ts`) — should work once
  `ChatBoxReader` locks onto your chatbox; tune the regexes to RS3's exact wording.

**Needs calibration against the live client (you, with Alt1's dev console):**
- `readers/floor.ts` — floor/complexity/size/time are read from a fixed on-screen
  panel, so it needs real pixel offsets and a font definition. It's a guarded no-op
  until you set `calibrated = true` and fill in the regions. Steps are documented in
  the file. Everything else runs regardless, so the app is useful before this is done.

## Going to production (storage)

`JsonFileStore` is zero-config for getting started. For a real deployment implement
the `EventStore` interface (`services/api/src/store.ts`) against Postgres — a single
append-only `events` table with a unique index on `id` gives you the same dedupe
semantics, and `aggregate()` stays unchanged.

## License

MIT
