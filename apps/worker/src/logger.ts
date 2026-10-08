import { pino, type DestinationStream, type Logger } from 'pino';
import type { WorkerConfig } from './config.js';
import { safeError } from './safe-error.js';

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
    // Covers these keys at the log root and up to three levels deep. Error objects go through
    // `safeError`, which never copies arbitrary properties.
    redact: {
      paths: [
        ...REDACTED_KEYS.map((k) => `["${k}"]`),
        ...REDACTED_KEYS.map((k) => `*["${k}"]`),
        ...REDACTED_KEYS.map((k) => `*.*["${k}"]`),
        ...REDACTED_KEYS.map((k) => `*.*.*["${k}"]`),
      ],
      censor: '[Redacted]',
    },
    serializers: { err: safeError, error: safeError },
  };
  return stream ? pino(options, stream) : pino(options);
}
