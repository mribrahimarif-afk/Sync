import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { isPublicErrorResponse } from '@sync/contracts';
import { captureLogs, createTestApp } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('public error contract', () => {
  it('answers unknown routes with a 404 error body', async () => {
    app = await createTestApp();
    const response = await app.inject({ url: '/api/does-not-exist' });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(isPublicErrorResponse(body)).toBe(true);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('answers malformed JSON with 400, not 500', async () => {
    app = await createTestApp({
      routes: (instance) => {
        instance.post('/test/echo', async () => ({ ok: true }));
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(isPublicErrorResponse(body)).toBe(true);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('reports validation problems by location without echoing submitted values', async () => {
    app = await createTestApp({
      routes: (instance) => {
        instance.post(
          '/test/echo',
          {
            schema: {
              body: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', minLength: 3 } },
              },
            },
          },
          async () => ({ ok: true }),
        );
      },
    });

    const missing = await app.inject({ method: 'POST', url: '/test/echo', payload: {} });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ path: 'body/name' }],
    });

    const tooShort = await app.inject({
      method: 'POST',
      url: '/test/echo',
      payload: { name: 'zq' },
    });
    expect(tooShort.statusCode).toBe(400);
    expect(tooShort.json().error.details[0].path).toBe('body/name');
    expect(isPublicErrorResponse(tooShort.json())).toBe(true);
    expect(tooShort.body).not.toContain('zq');
  });

  it('answers unsupported content types with 415', async () => {
    app = await createTestApp({
      routes: (instance) => {
        instance.post('/test/echo', async () => ({ ok: true }));
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/x-weird' },
      payload: 'x',
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects bodies over the configured limit with 413', async () => {
    app = await createTestApp({
      config: { bodyLimitBytes: 1024 },
      routes: (instance) => {
        instance.post('/test/echo', async () => ({ ok: true }));
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/test/echo',
      payload: { filler: 'x'.repeat(4096) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('hides the cause of unexpected failures but logs it server-side', async () => {
    const logs = captureLogs();
    app = await createTestApp({
      logs,
      routes: (instance) => {
        instance.get('/test/boom', async () => {
          throw new Error('SELECT * FROM members failed; password=hunter2');
        });
      },
    });

    const response = await app.inject({ url: '/test/boom' });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(isPublicErrorResponse(body)).toBe(true);
    expect(body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(response.body).not.toMatch(/hunter2|SELECT|stack|\.ts:/i);
    // The operator still gets the details, tied to the same request ID.
    const failure = logs
      .records()
      .find((r) => r.msg === 'Unhandled request error' && r.reqId === body.error.requestId);
    expect(failure).toBeDefined();
  });

  it('preserves framework 4xx statuses raised by handlers', async () => {
    app = await createTestApp({
      routes: (instance) => {
        instance.get('/test/teapot', async (_request, reply) => {
          reply.code(409);
          throw Object.assign(new Error('conflict details'), { statusCode: 409 });
        });
      },
    });
    const response = await app.inject({ url: '/test/teapot' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('REQUEST_REJECTED');
    expect(response.body).not.toContain('conflict details');
  });

  it('applies rate limiting with the public error shape', async () => {
    app = await createTestApp({ config: { rateLimit: { max: 2, windowSeconds: 60 } } });
    const statuses: number[] = [];
    let last = await app.inject({ url: '/api/health' });
    statuses.push(last.statusCode);
    for (let i = 0; i < 2; i += 1) {
      last = await app.inject({ url: '/api/health' });
      statuses.push(last.statusCode);
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect(isPublicErrorResponse(last.json())).toBe(true);
    expect(last.json().error.code).toBe('RATE_LIMITED');
    expect(last.headers['x-request-id']).toBe(last.json().error.requestId);
  });

  it('rate-limits unknown paths too, and forwarded headers cannot reset the budget', async () => {
    app = await createTestApp({ config: { rateLimit: { max: 2, windowSeconds: 60 } } });
    const statuses: number[] = [];
    let last;
    for (let i = 0; i < 5; i += 1) {
      last = await app.inject({
        url: `/scan/path-${i}`,
        headers: { 'x-forwarded-for': `203.0.113.${i}` },
      });
      statuses.push(last.statusCode);
    }
    expect(statuses).toEqual([404, 404, 429, 429, 429]);
    expect(isPublicErrorResponse(last!.json())).toBe(true);
    expect(last!.json().error.code).toBe('RATE_LIMITED');
    expect(last!.headers['x-request-id']).toBe(last!.json().error.requestId);
  });

  it('answers malformed CORS preflights with the public error contract', async () => {
    app = await createTestApp();
    const withOrigin = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { origin: 'https://app.example.test', 'x-request-id': 'preflight-trace-001' },
    });
    expect(withOrigin.statusCode).toBe(400);
    expect(withOrigin.headers['content-type']).toMatch(/application\/json/);
    expect(isPublicErrorResponse(withOrigin.json())).toBe(true);
    expect(withOrigin.json().error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The request was malformed.',
      requestId: 'preflight-trace-001',
    });
    expect(withOrigin.headers['x-request-id']).toBe('preflight-trace-001');

    const withoutOrigin = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { 'access-control-request-method': 'GET' },
    });
    expect(withoutOrigin.statusCode).toBe(400);
    expect(isPublicErrorResponse(withoutOrigin.json())).toBe(true);
  });

  it('does not ship test-only routes in the production application', async () => {
    app = await createTestApp();
    for (const url of ['/test/boom', '/test/echo']) {
      expect((await app.inject({ url })).statusCode).toBe(404);
    }
  });
});
