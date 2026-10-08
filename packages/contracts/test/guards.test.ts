import { describe, expect, it } from 'vitest';
import { isHealthResponse, isPublicErrorResponse } from '../src/index.js';

const validHealth = {
  service: 'sync-api',
  status: 'ok',
  time: '2026-10-08T10:00:00.000Z',
  uptimeSeconds: 12,
};

describe('isHealthResponse', () => {
  it('accepts a well-formed health payload', () => {
    expect(isHealthResponse(validHealth)).toBe(true);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a different service', { ...validHealth, service: 'other' }],
    ['a non-ok status', { ...validHealth, status: 'degraded' }],
    ['an unparseable time', { ...validHealth, time: 'yesterday' }],
    ['a numeric-looking time', { ...validHealth, time: '0' }],
    ['a non-UTC time', { ...validHealth, time: '2026-10-08T10:00:00+05:00' }],
    ['a negative uptime', { ...validHealth, uptimeSeconds: -1 }],
    ['a non-finite uptime', { ...validHealth, uptimeSeconds: Infinity }],
    ['a missing field', { service: 'sync-api', status: 'ok' }],
  ])('rejects %s', (_label, value) => {
    expect(isHealthResponse(value)).toBe(false);
  });
});

describe('isPublicErrorResponse', () => {
  const base = { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req-12345678' };

  it('accepts an error with and without details', () => {
    expect(isPublicErrorResponse({ error: base })).toBe(true);
    expect(
      isPublicErrorResponse({
        error: {
          ...base,
          code: 'VALIDATION_FAILED',
          details: [{ path: 'body/x', message: 'bad' }],
        },
      }),
    ).toBe(true);
  });

  it.each([
    ['a missing envelope', base],
    ['an unknown code', { error: { ...base, code: 'EXPLODED' } }],
    ['a missing request ID', { error: { code: 'NOT_FOUND', message: 'x' } }],
    ['a markup request ID', { error: { ...base, requestId: '<script>' } }],
    ['malformed details', { error: { ...base, details: [{ path: 1 }] } }],
  ])('rejects %s', (_label, value) => {
    expect(isPublicErrorResponse(value)).toBe(false);
  });
});
