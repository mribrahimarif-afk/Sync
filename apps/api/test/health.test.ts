import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isHealthResponse } from '@sync/contracts';
import { buildApp } from '../src/app.js';
import { captureLogs, createTestApp, testConfig } from './helpers.js';

describe('GET /api/health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns a process-health payload that satisfies the shared contract', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    const body = response.json();
    expect(isHealthResponse(body)).toBe(true);
    expect(Math.abs(Date.parse(body.time) - Date.now())).toBeLessThan(5000);
  });

  it('does not claim any dependency readiness', async () => {
    const body = (await app.inject({ url: '/api/health' })).json();
    expect(Object.keys(body).sort()).toEqual(['service', 'status', 'time', 'uptimeSeconds']);
  });

  it('sends baseline security headers and forbids caching', async () => {
    const { headers } = await app.inject({ url: '/api/health' });
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});

describe('application lifecycle', () => {
  it('can be built and closed repeatedly without binding a port', async () => {
    for (let i = 0; i < 2; i += 1) {
      const instance = await buildApp({ config: testConfig(), logStream: captureLogs().stream });
      await instance.ready();
      await instance.close();
    }
  });

  it('refuses requests after close', async () => {
    const instance = await createTestApp();
    await instance.close();
    // A closed instance must not keep serving; inject rejects or answers with an error status.
    const outcome = await instance
      .inject({ url: '/api/health' })
      .then((r) => r.statusCode)
      .catch(() => 'rejected');
    expect(outcome).not.toBe(200);
  });
});
