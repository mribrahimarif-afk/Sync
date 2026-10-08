import { pino, type DestinationStream, type Logger } from 'pino';
import type { WorkerConfig } from './config.js';

const REDACTED_KEYS = [
  'authorization',
  'cookie',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'clientSecret',
];

export function createLogger(
  config: Pick<WorkerConfig, 'logLevel'>,
  stream?: DestinationStream,
): Logger {
  const options = {
    level: config.logLevel,
    base: { service: 'sync-worker' },
    // Covers these keys at the log root and one level deep (e.g. `headers.cookie`).
    redact: {
      paths: [...REDACTED_KEYS.map((k) => `["${k}"]`), ...REDACTED_KEYS.map((k) => `*["${k}"]`)],
      censor: '[Redacted]',
    },
  };
  return stream ? pino(options, stream) : pino(options);
}
