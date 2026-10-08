import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createWorker } from './worker.js';

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config);
  const worker = createWorker(logger);

  let shuttingDown = false;
  const shutdown = (reason: string, exitCode: number): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'Shutting down worker');
    worker.stop().then(
      () => {
        process.exitCode = exitCode;
      },
      (err: unknown) => {
        logger.error({ err }, 'Error while stopping worker');
        process.exitCode = 1;
      },
    );
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => shutdown(signal, 0));
  }
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'Unhandled promise rejection');
    shutdown('unhandledRejection', 1);
  });

  worker.start();
}

try {
  main();
} catch (err) {
  console.error(
    err instanceof ConfigError ? err.message : `Worker failed to start: ${String(err)}`,
  );
  process.exitCode = 1;
}
