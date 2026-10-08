import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { REQUEST_ID_HEADER } from '@sync/contracts';

// An incoming ID is only accepted when it is short and made of safe characters, so it can
// never inject log lines, headers or markup. Anything else is replaced with a fresh UUID.
const ACCEPTED_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;

export function resolveRequestId(req: Pick<IncomingMessage, 'headers'>): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  return typeof incoming === 'string' && ACCEPTED_ID.test(incoming) ? incoming : randomUUID();
}
