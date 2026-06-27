import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

/**
 * Constant-time secret comparison. Hashing both sides first means we compare
 * fixed-length digests, so neither the result nor the timing leaks the key's
 * length or content.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Returns a Fastify preHandler that rejects the request unless the named header
 * matches `expected`. Used to gate every route that writes or deletes data.
 *
 * Fastify lowercases header names, so pass them lowercase (e.g. "x-ingest-key").
 */
export function requireKey(headerName: string, expected: string): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const provided = req.headers[headerName];
    if (typeof provided !== "string" || !safeEqual(provided, expected)) {
      reply.code(401).send({ error: "unauthorized" });
    }
  };
}
