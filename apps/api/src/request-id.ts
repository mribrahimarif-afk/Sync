import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { REQUEST_ID_HEADER, REQUEST_ID_PATTERN } from '@sync/contracts';

// An incoming ID is only accepted when it matches the shared pattern, so it can never inject
// log lines, headers or markup. Anything else is replaced with a fresh UUID.

export function resolveRequestId(req: Pick<IncomingMessage, 'headers'>): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : randomUUID();
}
