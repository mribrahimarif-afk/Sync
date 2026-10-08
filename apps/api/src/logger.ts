import type { FastifyServerOptions } from 'fastify';
import type { ApiConfig } from './config.js';
import { safeError } from './safe-error.js';

const REDACTED_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'clientSecret',
];

// Covers these keys at the log root, up to three levels deep (e.g. `context.body.password`)
// and inside `req.headers` / `res.headers`. Error objects go through `safeError` instead,
// which never copies arbitrary properties.
const REDACT_PATHS = [
  ...REDACTED_KEYS.map((key) => `["${key}"]`),
  ...REDACTED_KEYS.map((key) => `*["${key}"]`),
  ...REDACTED_KEYS.map((key) => `*.*["${key}"]`),
  ...REDACTED_KEYS.map((key) => `*.*.*["${key}"]`),
  ...REDACTED_KEYS.map((key) => `req.headers["${key}"]`),
  ...REDACTED_KEYS.map((key) => `res.headers["${key}"]`),
];

/**
 * Structured logging options. Request logs only contain method, path (query string removed,
 * as it may carry tokens) and client address; headers and bodies are never logged by default.
 */
export function buildLoggerOptions(
  config: Pick<ApiConfig, 'logLevel'>,
  stream?: NodeJS.WritableStream,
): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    serializers: {
      // Fastify types the serializer result as a pino error shape; ours is a strict subset.
      err: (value: unknown) => safeError(value) as never,
      error: (value: unknown) => safeError(value) as never,
      req: (req) => ({
        method: req.method,
        url: req.url.split('?')[0],
        remoteAddress: req.ip,
      }),
    },
    ...(stream ? { stream } : {}),
  };
}
