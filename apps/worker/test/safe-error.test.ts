import { describe, expect, it } from 'vitest';
import { safeError, scrubText } from '../src/safe-error.js';

describe('scrubText', () => {
  it.each([
    ['password=hunter2 next', 'hunter2'],
    ['{"password":"hunter2"}', 'hunter2'],
    ["api_key: 'hunter2'", 'hunter2'],
    ['Authorization: Bearer hunter2', 'hunter2'],
    ['token=hunter2&x=1', 'hunter2'],
    ['mysql://root:hunter2@host/db', 'hunter2'],
  ])('removes the credential from %s', (input, secret) => {
    expect(scrubText(input)).not.toContain(secret);
  });

  it('leaves ordinary text alone', () => {
    expect(scrubText('Member 42 not found')).toBe('Member 42 not found');
  });
});

describe('safeError', () => {
  it('drops arbitrary properties and limits cause depth', () => {
    const deep = new Error('d0', {
      cause: new Error('d1', {
        cause: new Error('d2', { cause: new Error('d3', { cause: new Error('d4') }) }),
      }),
    });
    const result = safeError(Object.assign(deep, { context: { password: 'x' } }));
    expect(JSON.stringify(result)).not.toContain('context');
    expect(result.cause?.cause?.cause?.cause).toBeUndefined();
  });

  it('handles thrown non-errors', () => {
    expect(safeError('token=abc123')).toEqual({ type: 'NonError', message: 'token=[Redacted]' });
    expect(safeError(undefined).type).toBe('NonError');
  });

  it('ignores malformed codes', () => {
    expect(safeError(Object.assign(new Error('x'), { code: 'bad code!' })).code).toBeUndefined();
  });
});
