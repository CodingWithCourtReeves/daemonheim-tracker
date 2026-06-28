import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { TrackerEvent } from "@daemonheim/shared";
import { createStore } from "./db.js";
import { aggregate } from "./aggregate.js";
import { requireKey } from "./security.js";
import { startRuneMetricsPoller } from "./poller.js";

const NODE_ENV = process.env.NODE_ENV ?? "development";
const PROD = NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const INGEST_KEY = process.env.INGEST_KEY ?? "";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN ?? "";

// --- Fail closed: refuse to start in production without secrets set. ---------
if (PROD && (!INGEST_KEY || !ADMIN_KEY)) {
  console.error("Refusing to start: INGEST_KEY and ADMIN_KEY must be set in production.");
  process.exit(1);
}
if (!PROD && (!INGEST_KEY || !ADMIN_KEY)) {
  console.warn("[dev] INGEST_KEY/ADMIN_KEY unset — write routes are UNGUARDED. Set them before deploying.");
}

const { store, close, kind } = createStore();

const app = Fastify({
  logger: true,
  bodyLimit: 256 * 1024, // cap payloads (256 KB) to blunt oversized-body abuse
});

await app.register(helmet);
await app.register(cors, {
  // Reads come from the dashboard origin; lock to it in prod, open in dev.
  origin: PROD ? (DASHBOARD_ORIGIN || false) : true,
  methods: ["GET", "POST", "DELETE"],
});
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_MAX ?? 200), // requests
  timeWindow: "1 minute",
});

// Guards: only requests with the right key may write or delete.
const guardIngest = INGEST_KEY ? requireKey("x-ingest-key", INGEST_KEY) : undefined;
const guardAdmin = ADMIN_KEY ? requireKey("x-admin-key", ADMIN_KEY) : undefined;

// --- Validation schemas ------------------------------------------------------
const eventSchema = {
  type: "object",
  required: ["id", "type", "player", "ts"],
  properties: {
    id: { type: "string", maxLength: 64 },
    type: { type: "string", maxLength: 32 },
    player: { type: "string", maxLength: 32 },
    ts: { type: "number" },
  },
  additionalProperties: true, // per-type fields (floor, boss, item, …) allowed
} as const;

const ingestBodySchema = {
  anyOf: [eventSchema, { type: "array", items: eventSchema, maxItems: 50 }],
} as const;

const playerParamSchema = {
  type: "object",
  required: ["player"],
  properties: { player: { type: "string", maxLength: 32, pattern: "^[\\w \\-]+$" } },
} as const;

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", maxLength: 64 } },
} as const;

// --- Routes ------------------------------------------------------------------
app.get("/health", async () => ({ ok: true, store: kind }));

/** POST /ingest — Alt1 app sends one event or a batch. Keyed + validated. */
app.post<{ Body: TrackerEvent | TrackerEvent[] }>(
  "/ingest",
  {
    preHandler: guardIngest,
    schema: { body: ingestBodySchema },
    config: { rateLimit: { max: 600, timeWindow: "1 minute" } }, // bursty but single client
  },
  async (req) => {
    const incoming = Array.isArray(req.body) ? req.body : [req.body];
    let accepted = 0;
    for (const ev of incoming) if (await store.append(ev)) accepted++;
    return { accepted, received: incoming.length };
  },
);

/** GET /stats/:player — public read for the dashboard. */
app.get<{ Params: { player: string } }>(
  "/stats/:player",
  { schema: { params: playerParamSchema } },
  async (req) => aggregate(req.params.player, await store.all(req.params.player)),
);

/** GET /events/:player — raw log; admin-only (useful for debugging readers). */
app.get<{ Params: { player: string } }>(
  "/events/:player",
  { preHandler: guardAdmin, schema: { params: playerParamSchema } },
  async (req) => store.all(req.params.player),
);

/** DELETE /events/:id — void a bad event (OCR misread, test data). Admin-only. */
app.delete<{ Params: { id: string } }>(
  "/events/:id",
  { preHandler: guardAdmin, schema: { params: idParamSchema } },
  async (req, reply) => {
    const ok = await store.void(req.params.id);
    if (!ok) return reply.code(404).send({ error: "no such event" });
    return { voided: req.params.id };
  },
);

// --- Lifecycle ---------------------------------------------------------------
async function shutdown() {
  app.log.info("shutting down");
  await app.close();
  await close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Optional: keep XP/skills fresh straight from RuneMetrics, no Alt1 required.
const POLL_PLAYER = process.env.POLL_PLAYER ?? "";
if (POLL_PLAYER) {
  const everyMs = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
  startRuneMetricsPoller(store, POLL_PLAYER, everyMs, (m) => app.log.info(m));
  app.log.info(`RuneMetrics poller on for ${POLL_PLAYER} every ${everyMs}ms`);
}

app
  .listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`Daemonheim API on http://${HOST}:${PORT} (store: ${kind})`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
