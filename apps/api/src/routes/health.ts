import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@sync/contracts';

/**
 * Reports only that this process is serving requests. No database, queue or provider is
 * configured yet, so none is probed or claimed.
 */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/health', async (): Promise<HealthResponse> => ({
    service: 'sync-api',
    status: 'ok',
    time: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }));
}
