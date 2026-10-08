import type { Logger } from 'pino';

export interface Worker {
  start(): void;
  stop(): Promise<void>;
}

// setInterval's maximum delay; the timer exists only to keep the process alive.
const KEEP_ALIVE_MS = 2_147_483_647;

/**
 * Process skeleton only. It owns no queue, database or schedule: there is no job processing
 * to start or drain yet. Future tasks add the durable job runner behind start()/stop().
 */
export function createWorker(logger: Logger): Worker {
  let state: 'idle' | 'running' | 'stopped' = 'idle';
  let keepAlive: NodeJS.Timeout | undefined;

  return {
    start() {
      if (state !== 'idle') throw new Error(`Worker cannot start from state "${state}"`);
      state = 'running';
      keepAlive = setInterval(() => {}, KEEP_ALIVE_MS);
      logger.info(
        'Sync worker started. Durable job processing is not implemented or configured yet: ' +
          'no queue, database or schedule is connected and no jobs will run.',
      );
    },

    async stop() {
      if (state !== 'running') return;
      state = 'stopped';
      clearInterval(keepAlive);
      keepAlive = undefined;
      logger.info('Sync worker stopped');
    },
  };
}
