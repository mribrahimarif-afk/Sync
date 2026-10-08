import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth } from '../lib/health-client';
import { jsonResponse, stubPendingFetch } from './fetch-mock';

const health = {
  service: 'sync-api',
  status: 'ok',
  time: '2026-10-08T10:00:00.000Z',
  uptimeSeconds: 3,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('returns the health payload from a valid response', async () => {
    const { calls } = stubPendingFetch();
    const promise = fetchHealth({ baseUrl: 'http://api.test' });
    calls[0]!.respond(jsonResponse(health));

    expect(await promise).toEqual({ ok: true, health });
    expect(calls[0]!.url).toBe('http://api.test/api/health');
  });

  it('rejects a 200 response that does not match the contract', async () => {
    const { calls } = stubPendingFetch();
    const promise = fetchHealth({ baseUrl: 'http://api.test' });
    calls[0]!.respond(jsonResponse({ status: 'ok' }));

    expect(await promise).toMatchObject({
      ok: false,
      reason: 'failed',
      message: expect.stringMatching(/unexpected/),
    });
  });

  it('surfaces the public error message and request ID from an error body', async () => {
    const { calls } = stubPendingFetch();
    const promise = fetchHealth({ baseUrl: 'http://api.test' });
    calls[0]!.respond(
      jsonResponse(
        {
          error: { code: 'RATE_LIMITED', message: 'Too many requests.', requestId: 'req-abc12345' },
        },
        { status: 429 },
      ),
    );

    expect(await promise).toEqual({
      ok: false,
      reason: 'failed',
      message: 'Too many requests.',
      requestId: 'req-abc12345',
    });
  });

  it('falls back to the status code and only trusts a well-formed request ID header', async () => {
    const { calls } = stubPendingFetch();
    const good = fetchHealth({ baseUrl: 'http://api.test' });
    calls[0]!.respond(
      new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'x-request-id': 'edge-id-12345' },
      }),
    );
    expect(await good).toMatchObject({
      message: expect.stringContaining('HTTP 502'),
      requestId: 'edge-id-12345',
    });

    const bad = fetchHealth({ baseUrl: 'http://api.test' });
    calls[1]!.respond(
      new Response('x', { status: 502, headers: { 'x-request-id': '<b>nope</b>' } }),
    );
    expect(await bad).not.toHaveProperty('requestId');
  });

  it('reports an unreachable API', async () => {
    const { calls } = stubPendingFetch();
    const promise = fetchHealth({ baseUrl: 'http://api.test' });
    calls[0]!.fail(new TypeError('fetch failed'));

    expect(await promise).toMatchObject({
      ok: false,
      reason: 'failed',
      message: expect.stringMatching(/could not be reached/),
    });
  });

  it('gives up after the timeout and says so', async () => {
    vi.useFakeTimers();
    const { calls } = stubPendingFetch();
    const promise = fetchHealth({ baseUrl: 'http://api.test', timeoutMs: 5000 });

    await vi.advanceTimersByTimeAsync(5000);

    expect(calls[0]!.signal.aborted).toBe(true);
    expect(await promise).toMatchObject({
      reason: 'failed',
      message: expect.stringMatching(/in time/),
    });
  });

  it('resolves as aborted when the caller cancels', async () => {
    const { calls } = stubPendingFetch();
    const controller = new AbortController();
    const promise = fetchHealth({ baseUrl: 'http://api.test', signal: controller.signal });

    controller.abort();

    expect(await promise).toEqual({ ok: false, reason: 'aborted' });
    expect(calls[0]!.signal.aborted).toBe(true);
  });

  it('does not call the network when already aborted', async () => {
    const { mock } = stubPendingFetch();
    const controller = new AbortController();
    controller.abort();

    expect(await fetchHealth({ baseUrl: 'http://api.test', signal: controller.signal })).toEqual({
      ok: false,
      reason: 'aborted',
    });
    expect(mock).not.toHaveBeenCalled();
  });
});
