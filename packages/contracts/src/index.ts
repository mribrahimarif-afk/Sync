/**
 * Contracts shared by the Sync API and web app.
 * Framework-independent: no server, database or UI dependencies, and no configuration.
 */

/** Header carrying the request/correlation ID on every API response. */
export const REQUEST_ID_HEADER = 'x-request-id';

export interface HealthResponse {
  service: 'sync-api';
  /** The API process is running and serving requests. It says nothing about dependencies. */
  status: 'ok';
  /** Server time as an ISO-8601 UTC instant. */
  time: string;
  uptimeSeconds: number;
}

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'REQUEST_REJECTED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ValidationIssue {
  /** Location of the problem, e.g. `body/name`. Never contains submitted values. */
  path: string;
  message: string;
}

export interface PublicErrorResponse {
  error: {
    code: ErrorCode;
    /** Safe to show to end users. */
    message: string;
    requestId: string;
    details?: ValidationIssue[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value) &&
    value.service === 'sync-api' &&
    value.status === 'ok' &&
    typeof value.time === 'string' &&
    !Number.isNaN(Date.parse(value.time)) &&
    typeof value.uptimeSeconds === 'number' &&
    Number.isFinite(value.uptimeSeconds) &&
    value.uptimeSeconds >= 0
  );
}

export function isPublicErrorResponse(value: unknown): value is PublicErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  const { code, message, requestId, details } = value.error;
  return (
    typeof code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(code) &&
    typeof message === 'string' &&
    typeof requestId === 'string' &&
    (details === undefined ||
      (Array.isArray(details) &&
        details.every(
          (d) => isRecord(d) && typeof d.path === 'string' && typeof d.message === 'string',
        )))
  );
}
