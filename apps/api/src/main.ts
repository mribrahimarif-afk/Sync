import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ reason }, 'Shutting down API');
    const forceExit = setTimeout(() => {
      app.log.error('Graceful shutdown timed out; exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    try {
      await app.close();
      app.log.info('API shutdown complete');
      process.exitCode = exitCode;
    } catch (err) {
      app.log.error({ err }, 'Error while shutting down API');
      process.exitCode = 1;
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal, 0));
  }
  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'Uncaught exception');
    void shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (err) => {
    app.log.fatal({ err }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection', 1);
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.fatal({ err }, 'API failed to start');
    await shutdown('startup failure', 1);
  }
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(err.message);
  } else {
    console.error('API failed to start:', err);
  }
  process.exitCode = 1;
});
