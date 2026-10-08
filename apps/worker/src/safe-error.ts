/**
 * Log-safe view of an error. Arbitrary properties (`context`, `config`, attached requests...)
 * are never copied, because they can hold credentials at any depth. Only an allowlist is kept:
 * type, a well-formed code/status, and message/stack/cause text with credential-looking
 * content scrubbed.
 *
 * Kept identical to apps/worker/src/safe-error.ts (two small copies instead of a shared
 * runtime package).
 */

const SENSITIVE_KEY =
  '(?:authorization|cookie|set-cookie|password|passwd|pwd|passphrase|token|secret|api[-_]?key|access[-_]?key|private[-_]?key|credentials?)';

const SENSITIVE_PAIR = new RegExp(
  // key, optional quote, ":" or "=", then a quoted or bare value (optionally after a scheme).
  `(${SENSITIVE_KEY}[\\w-]*["']?\\s*[:=]\\s*)(?:(?:Bearer|Basic)\\s+)?("[^"]*"|'[^']*'|[^\\s,;&}\\])]+)`,
  'gi',
);
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

const MAX_TEXT = 1000;
const MAX_CAUSE_DEPTH = 3;

export function scrubText(text: string): string {
  return text
    .replace(URL_CREDENTIALS, '$1[Redacted]@')
    .replace(AUTH_SCHEME, '$1 [Redacted]')
    .replace(SENSITIVE_PAIR, '$1[Redacted]')
    .slice(0, MAX_TEXT);
}

export interface SafeError {
  type: string;
  message: string;
  code?: string;
  statusCode?: number;
  /** Stack frames only; the leading message lines are dropped (the message is logged scrubbed). */
  stack?: string;
  cause?: SafeError;
}

function stackFrames(stack: unknown): string | undefined {
  if (typeof stack !== 'string') return undefined;
  const frames = stack
    .split('\n')
    .filter((line) => /^\s+at\s/.test(line))
    .map((line) => scrubText(line.trim()));
  return frames.length > 0 ? frames.join('\n') : undefined;
}

export function safeError(value: unknown, depth = 0): SafeError {
  if (typeof value !== 'object' || value === null) {
    return { type: 'NonError', message: scrubText(String(value)) };
  }
  const err = value as Record<string, unknown>;
  const result: SafeError = {
    type: typeof err.name === 'string' ? scrubText(err.name).slice(0, 100) : 'Error',
    message: scrubText(typeof err.message === 'string' ? err.message : ''),
  };
  if (typeof err.code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(err.code)) {
    result.code = err.code;
  }
  if (typeof err.statusCode === 'number' && Number.isInteger(err.statusCode)) {
    result.statusCode = err.statusCode;
  }
  const stack = stackFrames(err.stack);
  if (stack) result.stack = stack;
  if (err.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    result.cause = safeError(err.cause, depth + 1);
  }
  return result;
}
