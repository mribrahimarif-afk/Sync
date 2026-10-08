import { z } from 'zod';

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid worker configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}\n` +
        'See apps/worker/.env.example for the supported variables.',
    );
    this.name = 'ConfigError';
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface WorkerConfig {
  env: 'development' | 'test' | 'production';
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  // Blank values are treated as unset so defaults apply.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      ),
    );
  }
  return { env: parsed.data.NODE_ENV, logLevel: parsed.data.LOG_LEVEL };
}
