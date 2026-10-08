import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('worker loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toEqual({ env: 'development', logLevel: 'info' });
  });

  it('treats blank values as unset', () => {
    expect(loadConfig({ LOG_LEVEL: '' }).logLevel).toBe('info');
  });

  it('accepts explicit values', () => {
    expect(loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'warn' })).toEqual({
      env: 'production',
      logLevel: 'warn',
    });
  });

  it('fails with an actionable error naming every invalid variable', () => {
    let error: unknown;
    try {
      loadConfig({ NODE_ENV: 'staging', LOG_LEVEL: 'loud' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('.env.example');
  });
});
