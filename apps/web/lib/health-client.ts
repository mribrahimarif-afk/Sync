import {
  isHealthResponse,
  isPublicErrorResponse,
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
  type HealthResponse,
} from '@sync/contracts';

export type HealthResult =
  | { ok: true; health: HealthResponse }
  | { ok: false; reason: 'aborted' }
  | { ok: false; reason: 'failed'; message: string; requestId?: string };

export interface FetchHealthOptions {
  baseUrl: string;
  /** Aborting resolves the call as `aborted`; callers should then ignore the result. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

function failed(message: string, requestId?: string): HealthResult {
  return { ok: false, reason: 'failed', message, ...(requestId ? { requestId } : {}) };
}

/** Calls GET /api/health once. Never retries; the user decides when to try again. */
export async function fetchHealth({
  baseUrl,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchHealthOptions): Promise<HealthResult> {
  if (signal?.aborted) return { ok: false, reason: 'aborted' };

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const headerId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
    const headerRequestId = headerId && REQUEST_ID_PATTERN.test(headerId) ? headerId : undefined;

    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      if (controller.signal.aborted) throw err;
      body = undefined;
    }

    if (response.ok && isHealthResponse(body)) return { ok: true, health: body };
    if (!response.ok && isPublicErrorResponse(body)) {
      return failed(body.error.message, body.error.requestId);
    }
    return failed(
      response.ok
        ? 'The API returned an unexpected response.'
        : `The API responded with an error (HTTP ${response.status}).`,
      headerRequestId,
    );
  } catch {
    if (signal?.aborted) return { ok: false, reason: 'aborted' };
    return failed(timedOut ? 'The API did not respond in time.' : 'The API could not be reached.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
