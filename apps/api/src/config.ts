import { isIP } from 'node:net';
import { z } from 'zod';

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid API configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}\n` +
        'See apps/api/.env.example for the supported variables.',
    );
    this.name = 'ConfigError';
  }
}

export interface ApiConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  corsAllowedOrigins: string[];
  /** Empty means forwarded headers are never trusted. */
  trustedProxies: string[];
  bodyLimitBytes: number;
  rateLimit: { max: number; windowSeconds: number };
}

const DEV_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(10_485_760).default(1_048_576),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000_000).default(300),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),
});

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function originProblem(origin: string): string | undefined {
  if (origin.includes('*')) return `"${origin}" is a wildcard; list explicit origins instead`;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return `"${origin}" is not a valid origin`;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `"${origin}" must use http: or https:`;
  }
  if (url.origin !== origin) {
    return `"${origin}" must be a bare origin (scheme, host, optional port) such as ${url.origin}`;
  }
  return undefined;
}

function proxyProblem(entry: string): string | undefined {
  const [address = '', prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  const maxPrefix = family === 6 ? 128 : 32;
  const prefixOk = prefix === undefined || (/^\d+$/.test(prefix) && Number(prefix) <= maxPrefix);
  return family === 0 || rest.length > 0 || !prefixOk
    ? `"${entry}" is not an IP address or CIDR range`
    : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  // Blank values (e.g. "PORT=") are treated as unset so defaults apply.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  const issues: string[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(`${issue.path.join('.') || 'environment'}: ${issue.message}`);
    }
  }

  const rawOrigins = splitList(cleaned.CORS_ALLOWED_ORIGINS);
  let corsAllowedOrigins = rawOrigins;
  if (rawOrigins.length === 0) {
    if (cleaned.NODE_ENV === 'production') {
      issues.push(
        'CORS_ALLOWED_ORIGINS: required in production; set it to the web app origin, for example https://app.example.com',
      );
    } else {
      corsAllowedOrigins = DEV_CORS_ORIGINS;
    }
  }
  for (const origin of rawOrigins) {
    const problem = originProblem(origin);
    if (problem) issues.push(`CORS_ALLOWED_ORIGINS: ${problem}`);
  }

  const trustedProxies = splitList(cleaned.TRUSTED_PROXIES);
  for (const entry of trustedProxies) {
    const problem = proxyProblem(entry);
    if (problem) issues.push(`TRUSTED_PROXIES: ${problem}`);
  }

  if (!parsed.success || issues.length > 0) throw new ConfigError(issues);

  const data = parsed.data;
  return {
    env: data.NODE_ENV,
    host: data.HOST,
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    corsAllowedOrigins,
    trustedProxies,
    bodyLimitBytes: data.BODY_LIMIT_BYTES,
    rateLimit: { max: data.RATE_LIMIT_MAX, windowSeconds: data.RATE_LIMIT_WINDOW_SECONDS },
  };
}
