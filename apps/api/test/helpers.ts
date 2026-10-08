import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type ApiConfig } from '../src/config.js';

export function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    ...loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info' }),
    corsAllowedOrigins: ['https://app.example.test'],
    ...overrides,
  };
}

export interface LogCapture {
  stream: Writable;
  /** Raw text of everything logged so far. */
  text(): string;
  /** Parsed JSON log records. */
  records(): Record<string, unknown>[];
}

export function captureLogs(): LogCapture {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const text = () => chunks.join('');
  return {
    stream,
    text,
    records: () =>
      text()
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

/** Builds an app, lets the test add its own routes, and returns it ready. */
export async function createTestApp(
  options: {
    config?: Partial<ApiConfig>;
    logs?: LogCapture;
    routes?: (app: FastifyInstance) => void;
  } = {},
): Promise<FastifyInstance> {
  const app = await buildApp({
    config: testConfig(options.config),
    logStream: (options.logs ?? captureLogs()).stream,
  });
  options.routes?.(app);
  await app.ready();
  return app;
}
