'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse } from '@sync/contracts';
import { fetchHealth } from '../lib/health-client';

type Status =
  | { phase: 'loading' }
  | { phase: 'success'; health: HealthResponse }
  | { phase: 'error'; message: string; requestId?: string };

export function ApiStatus({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Each effect run owns its result: if a newer attempt started or the component unmounted,
    // this run's cleanup aborts the request and its late result is dropped.
    let current = true;

    void fetchHealth({ baseUrl: apiBaseUrl, signal: controller.signal }).then((result) => {
      if (!current || (!result.ok && result.reason === 'aborted')) return;
      setStatus(
        result.ok
          ? { phase: 'success', health: result.health }
          : {
              phase: 'error',
              message: result.message,
              ...(result.requestId ? { requestId: result.requestId } : {}),
            },
      );
    });

    return () => {
      current = false;
      controller.abort();
    };
  }, [apiBaseUrl, attempt]);

  const checking = status.phase === 'loading';

  function recheck() {
    if (checking) return;
    setStatus({ phase: 'loading' });
    setAttempt((n) => n + 1);
  }

  return (
    <section className="card" aria-labelledby="connectivity-heading">
      <h2 id="connectivity-heading">API connectivity</h2>

      {status.phase === 'loading' && (
        <p role="status" className="state state-loading">
          Checking whether the Sync API is reachable…
        </p>
      )}

      {status.phase === 'success' && (
        <div role="status" className="state state-ok">
          <p className="state-title">API reachable</p>
          <dl className="facts">
            <div>
              <dt>Service</dt>
              <dd>{status.health.service}</dd>
            </div>
            <div>
              <dt>Process uptime</dt>
              <dd>{status.health.uptimeSeconds} s</dd>
            </div>
            <div>
              <dt>Server time (UTC)</dt>
              <dd>
                <time dateTime={status.health.time}>{status.health.time}</time>
              </dd>
            </div>
          </dl>
          <p className="note">
            Reachable only means the API process answered. It does not mean Sync is operational: no
            database, background jobs or product features exist yet.
          </p>
        </div>
      )}

      {status.phase === 'error' && (
        <div role="alert" className="state state-error">
          <p className="state-title">API unavailable</p>
          <p>{status.message}</p>
          {status.requestId && (
            <p className="note">
              Request ID: <code>{status.requestId}</code>
            </p>
          )}
          <p className="note">
            Check that the API is running (<code>npm run dev:api</code>) and that this site&apos;s
            origin is allowed by its CORS settings.
          </p>
        </div>
      )}

      <p className="target">
        API address: <code>{apiBaseUrl}</code>
      </p>

      <button type="button" onClick={recheck} aria-disabled={checking}>
        {checking ? 'Checking…' : status.phase === 'error' ? 'Retry' : 'Check again'}
      </button>
    </section>
  );
}
