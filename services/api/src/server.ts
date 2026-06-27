import Fastify from "fastify";
import cors from "@fastify/cors";
import type { TrackerEvent } from "@daemonheim/shared";
import { JsonFileStore } from "./store.js";
import { aggregate } from "./aggregate.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA_FILE = process.env.DATA_FILE ?? "./data/events.json";
const INGEST_KEY = process.env.INGEST_KEY ?? ""; // set in prod; blank = open (dev only)

const store = new JsonFileStore(DATA_FILE);
const app = Fastify({ logger: true });

await app.register(cors, { origin: true }); // tighten to your Pages origin in prod

app.get("/health", async () => ({ ok: true }));

/**
 * POST /ingest — the Alt1 app sends one event (or a batch). Guarded by an API
 * key so randoms can't poison your stats. Dedupes on event.id.
 */
app.post<{ Body: TrackerEvent | TrackerEvent[] }>("/ingest", async (req, reply) => {
  if (INGEST_KEY && req.headers["x-ingest-key"] !== INGEST_KEY) {
    return reply.code(401).send({ error: "bad or missing x-ingest-key" });
  }
  const incoming = Array.isArray(req.body) ? req.body : [req.body];
  let accepted = 0;
  for (const ev of incoming) {
    if (!ev?.id || !ev?.type || !ev?.player) {
      return reply.code(400).send({ error: "event needs id, type, player" });
    }
    if (await store.append(ev)) accepted++;
  }
  return { accepted, received: incoming.length };
});

/** GET /stats/:player — the public dashboard reads this. */
app.get<{ Params: { player: string } }>("/stats/:player", async (req) => {
  const events = await store.all(req.params.player);
  return aggregate(req.params.player, events);
});

/** GET /events/:player — raw log, handy for debugging the readers. */
app.get<{ Params: { player: string } }>("/events/:player", async (req) => {
  return store.all(req.params.player);
});

app
  .listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`Daemonheim API on http://${HOST}:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
