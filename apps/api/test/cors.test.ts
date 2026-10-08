import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('CORS allowlist', () => {
  it('allows a configured origin and exposes the request ID header', async () => {
    app = await createTestApp();
    const response = await app.inject({
      url: '/api/health',
      headers: { origin: 'https://app.example.test' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.test');
    expect(response.headers['access-control-expose-headers']).toContain('x-request-id');
  });

  it('does not grant access to an origin outside the allowlist', async () => {
    app = await createTestApp();
    const response = await app.inject({
      url: '/api/health',
      headers: { origin: 'https://evil.example.test' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never answers with a wildcard origin', async () => {
    app = await createTestApp();
    const response = await app.inject({
      url: '/api/health',
      headers: { origin: 'https://app.example.test' },
    });
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('answers preflight for an allowed origin and denies it for others', async () => {
    app = await createTestApp();
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'https://app.example.test',
        'access-control-request-method': 'GET',
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.test');

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'https://evil.example.test',
        'access-control-request-method': 'GET',
      },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
