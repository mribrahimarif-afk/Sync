import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { REQUEST_ID_HEADER } from '@sync/contracts';
import type { ApiConfig } from './config.js';
import { registerErrorHandling } from './errors.js';
import { buildLoggerOptions } from './logger.js';
import { resolveRequestId } from './request-id.js';
import { registerHealthRoute } from './routes/health.js';

export interface BuildAppOptions {
  config: ApiConfig;
  /** Destination for structured logs; defaults to stdout. Tests inject their own. */
  logStream?: NodeJS.WritableStream;
}

/**
 * Builds the API without listening on a port. The returned instance is not yet `ready()`,
 * so callers (tests) may still add routes; call `close()` when finished.
 */
export async function buildApp({ config, logStream }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config, logStream),
    genReqId: resolveRequestId,
    bodyLimit: config.bodyLimitBytes,
    // Forwarded headers are ignored unless proxies are explicitly listed in configuration.
    trustProxy: config.trustedProxies.length > 0 ? config.trustedProxies : false,
  });

  // Registered first so even rate-limited responses carry the request ID.
  app.addHook('onRequest', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  registerErrorHandling(app);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsAllowedOrigins,
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowSeconds * 1000,
  });

  registerHealthRoute(app);

  return app;
}
