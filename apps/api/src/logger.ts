import type { FastifyServerOptions } from 'fastify';
import type { ApiConfig } from './config.js';

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

// Covers these keys at the log root, one level deep (e.g. `body.password`) and inside
// `req.headers` / `res.headers`.
const REDACT_PATHS = [
  ...REDACTED_KEYS.map((key) => `["${key}"]`),
  ...REDACTED_KEYS.map((key) => `*["${key}"]`),
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
      req: (req) => ({
        method: req.method,
        url: req.url.split('?')[0],
        remoteAddress: req.ip,
      }),
    },
    ...(stream ? { stream } : {}),
  };
}
