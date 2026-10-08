import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

function issuesFor(env: Record<string, string>): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.issues;
    throw err;
  }
  return [];
}

describe('loadConfig', () => {
  it('provides safe local defaults', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      env: 'development',
      host: '127.0.0.1',
      port: 4000,
      trustedProxies: [],
      bodyLimitBytes: 1_048_576,
    });
    expect(config.corsAllowedOrigins).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });

  it('treats blank values as unset', () => {
    expect(loadConfig({ PORT: '', HOST: '' }).port).toBe(4000);
  });

  it('parses explicit values', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '8080',
      CORS_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com:8443',
      TRUSTED_PROXIES: '10.0.0.0/8,::1',
    });
    expect(config.port).toBe(8080);
    expect(config.corsAllowedOrigins).toEqual([
      'https://a.example.com',
      'https://b.example.com:8443',
    ]);
    expect(config.trustedProxies).toEqual(['10.0.0.0/8', '::1']);
  });

  it('requires an explicit CORS allowlist in production', () => {
    expect(issuesFor({ NODE_ENV: 'production' }).join('\n')).toMatch(
      /CORS_ALLOWED_ORIGINS.*required/,
    );
  });

  it.each([
    '*',
    'https://*.example.com',
    'app.example.com',
    'https://app.example.com/path',
    'ftp://x.test',
  ])('rejects CORS origin %s', (origin) => {
    expect(
      issuesFor({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: origin }).join('\n'),
    ).toContain('CORS_ALLOWED_ORIGINS');
  });

  it('rejects wildcard origins outside production too', () => {
    expect(issuesFor({ CORS_ALLOWED_ORIGINS: '*' })).not.toEqual([]);
  });

  it('names every offending variable in one error', () => {
    const message = (() => {
      try {
        loadConfig({ PORT: 'abc', LOG_LEVEL: 'loud', TRUSTED_PROXIES: 'not-an-ip' });
      } catch (err) {
        return (err as Error).message;
      }
      return '';
    })();
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('TRUSTED_PROXIES');
    expect(message).toContain('.env.example');
  });

  it.each(['70000', '-1', '1.5'])('rejects PORT=%s', (port) => {
    expect(issuesFor({ PORT: port })).not.toEqual([]);
  });

  it.each(['10.0.0.0/33', '10.0.0.0/8/8', 'true'])('rejects TRUSTED_PROXIES=%s', (value) => {
    expect(issuesFor({ TRUSTED_PROXIES: value })).not.toEqual([]);
  });
});
