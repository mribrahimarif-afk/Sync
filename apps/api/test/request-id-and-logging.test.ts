import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { captureLogs, createTestApp } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('request identification', () => {
  it('generates an ID, returns it in the header and logs it', async () => {
    const logs = captureLogs();
    app = await createTestApp({ logs });

    const response = await app.inject({ url: '/api/health' });
    const id = response.headers['x-request-id'] as string;

    expect(id).toMatch(UUID);
    const requestRecords = logs.records().filter((r) => r.reqId === id);
    expect(requestRecords.length).toBeGreaterThanOrEqual(2); // incoming + completed
  });

  it('accepts a well-formed incoming correlation ID', async () => {
    const logs = captureLogs();
    app = await createTestApp({ logs });

    const response = await app.inject({
      url: '/api/health',
      headers: { 'x-request-id': 'client-trace-0123456789' },
    });

    expect(response.headers['x-request-id']).toBe('client-trace-0123456789');
    expect(logs.records().some((r) => r.reqId === 'client-trace-0123456789')).toBe(true);
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(200)],
    ['containing markup', '<script>alert(1)</script>'],
    ['containing spaces', 'has some spaces here'],
  ])('replaces an incoming ID that is %s', async (_label, hostile) => {
    app = await createTestApp();
    const response = await app.inject({ url: '/api/health', headers: { 'x-request-id': hostile } });
    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('puts the same ID in error bodies and headers', async () => {
    app = await createTestApp();
    const response = await app.inject({
      url: '/nope',
      headers: { 'x-request-id': 'client-trace-0123456789' },
    });
    expect(response.json().error.requestId).toBe('client-trace-0123456789');
    expect(response.headers['x-request-id']).toBe('client-trace-0123456789');
  });
});

describe('logging', () => {
  it('writes structured JSON without credentials, query strings or bodies', async () => {
    const logs = captureLogs();
    app = await createTestApp({
      logs,
      routes: (instance) => {
        instance.post('/test/echo', async () => ({ ok: true }));
      },
    });

    await app.inject({
      method: 'POST',
      url: '/test/echo?token=query-secret-123',
      headers: {
        authorization: 'Bearer header-secret-123',
        cookie: 'session=cookie-secret-123',
      },
      payload: { password: 'body-secret-123' },
    });

    const text = logs.text();
    expect(logs.records().length).toBeGreaterThan(0);
    for (const secret of [
      'header-secret-123',
      'cookie-secret-123',
      'query-secret-123',
      'body-secret-123',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('redacts sensitive fields in application log calls', async () => {
    const logs = captureLogs();
    app = await createTestApp({ logs });

    app.log.info(
      {
        authorization: 'Bearer top-secret-1',
        headers: { cookie: 'session=top-secret-2' },
        body: { password: 'top-secret-3', token: 'top-secret-4', name: 'visible-name' },
      },
      'diagnostic',
    );

    const text = logs.text();
    expect(text).not.toMatch(/top-secret-\d/);
    expect(text).toContain('[Redacted]');
    expect(text).toContain('visible-name');
  });
});

describe('credential safety of failure logs', () => {
  const SECRETS = [
    'ctx-auth-secret',
    'ctx-cookie-secret',
    'ctx-body-password',
    'msg-password-secret',
    'msg-bearer-secret',
    'cause-token-secret',
    'url-credential-secret',
    'deep-secret-value',
  ];

  function failure(): Error {
    const cause = Object.assign(new Error('upstream said token=cause-token-secret'), {
      config: { headers: { authorization: 'Bearer ctx-auth-secret' } },
    });
    return Object.assign(
      new Error(
        'login failed: password=msg-password-secret, header Authorization: Bearer msg-bearer-secret, ' +
          'url postgres://svc:url-credential-secret@db.internal/app',
        { cause },
      ),
      {
        code: 'E_LOGIN',
        context: {
          headers: { authorization: 'Bearer ctx-auth-secret', cookie: 'sid=ctx-cookie-secret' },
          body: { password: 'ctx-body-password' },
          nested: { a: { b: { secret: 'deep-secret-value' } } },
        },
      },
    );
  }

  it('keeps credentials out of unexpected-error logs but keeps safe diagnostics', async () => {
    const logs = captureLogs();
    app = await createTestApp({
      logs,
      routes: (instance) => {
        instance.get('/test/boom', async () => {
          throw failure();
        });
      },
    });

    const response = await app.inject({ url: '/test/boom' });

    const text = logs.text();
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(response.body).not.toMatch(/secret|password/i);
    const record = logs.records().find((r) => r.msg === 'Unhandled request error');
    expect(record).toMatchObject({
      reqId: response.json().error.requestId,
      err: { type: 'Error', code: 'E_LOGIN' },
    });
    expect((record!.err as { stack: string }).stack).toMatch(/at /);
    expect((record!.err as { message: string }).message).toContain('login failed');
  });

  it('redacts credentials nested several levels deep in ordinary log calls', async () => {
    const logs = captureLogs();
    app = await createTestApp({ logs });

    app.log.info({ a: { b: { password: 'deep-secret-value' } }, safe: 'kept' }, 'nested');

    expect(logs.text()).not.toContain('deep-secret-value');
    expect(logs.text()).toContain('kept');
  });

  it('sanitizes errors logged through app.log with the err key', async () => {
    const logs = captureLogs();
    app = await createTestApp({ logs });

    app.log.error({ err: failure() }, 'manual');

    for (const secret of SECRETS) expect(logs.text()).not.toContain(secret);
  });
});

describe('client address handling', () => {
  const routes = (instance: FastifyInstance) => {
    instance.get('/test/ip', async (request) => ({ ip: request.ip }));
  };

  it('ignores X-Forwarded-For unless proxies are explicitly trusted', async () => {
    app = await createTestApp({ routes });
    const response = await app.inject({
      url: '/test/ip',
      remoteAddress: '10.1.2.3',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(response.json().ip).toBe('10.1.2.3');
  });

  it('honours X-Forwarded-For from a configured trusted proxy', async () => {
    app = await createTestApp({ config: { trustedProxies: ['10.1.2.3'] }, routes });
    const response = await app.inject({
      url: '/test/ip',
      remoteAddress: '10.1.2.3',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(response.json().ip).toBe('203.0.113.9');
  });
});
