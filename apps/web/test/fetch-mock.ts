import { vi } from 'vitest';

export interface PendingCall {
  url: string;
  signal: AbortSignal;
  respond(response: Response): void;
  fail(error: Error): void;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/**
 * Replaces global fetch with a mock whose calls stay pending until the test settles them.
 * With `honorAbort: false` the mock keeps the request alive after an abort, which models a
 * response that arrives late for an obsolete request.
 */
export function stubPendingFetch({ honorAbort = true } = {}) {
  const calls: PendingCall[] = [];
  const mock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        if (honorAbort) {
          signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }
        calls.push({ url: String(input), signal, respond: resolve, fail: reject });
      }),
  );
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}
