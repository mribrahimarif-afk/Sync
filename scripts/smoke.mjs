// Process smoke test for the COMPILED API and worker (run `npm run build` first).
// Verifies: startup, the real health endpoint, config failure exit code, and clean termination.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { isHealthResponse } from '@sync/contracts';

const isWindows = process.platform === 'win32';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

function launch(entry, env) {
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const exited = new Promise((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal })),
  );
  return { child, exited, output: () => output };
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// Windows cannot deliver SIGTERM to a Node process (kill() terminates it abruptly), so graceful
// shutdown can only be asserted on POSIX. Unit tests cover the shutdown logic on every platform.
async function terminate(proc, label) {
  proc.child.kill('SIGTERM');
  const result = await Promise.race([
    proc.exited,
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 15000)),
  ]);
  if (result === 'timeout') {
    proc.child.kill('SIGKILL');
    check(`${label} exits after SIGTERM`, false, 'still running after 15s');
  } else if (isWindows) {
    check(
      `${label} stops after termination request`,
      true,
      'graceful-exit-code check is POSIX-only',
    );
  } else {
    check(`${label} exits with code 0 on SIGTERM`, result.code === 0, `code=${result.code}`);
  }
}

async function smokeApi() {
  const port = await freePort();
  const api = launch('apps/api/dist/main.js', {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    LOG_LEVEL: 'info',
  });
  try {
    const body = await waitFor(
      async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/health`);
          return response.ok ? await response.json() : undefined;
        } catch {
          return undefined;
        }
      },
      20000,
      'API health endpoint',
    );
    check('compiled API serves GET /api/health', isHealthResponse(body));
  } catch (err) {
    check('compiled API serves GET /api/health', false, `${err.message}\n${api.output()}`);
  }
  await terminate(api, 'API');
  if (!isWindows) {
    check('API logs a completed shutdown', api.output().includes('API shutdown complete'));
  }
}

async function smokeApiConfigFailure() {
  // Production without an explicit CORS allowlist must refuse to start.
  const api = launch('apps/api/dist/main.js', { NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: '' });
  const result = await api.exited;
  check(
    'API with invalid configuration exits non-zero with an actionable message',
    result.code === 1 && api.output().includes('CORS_ALLOWED_ORIGINS'),
    `code=${result.code}`,
  );
}

async function smokeWorker() {
  const worker = launch('apps/worker/dist/main.js', { NODE_ENV: 'production', LOG_LEVEL: 'info' });
  try {
    await waitFor(
      () => worker.output().includes('not implemented or configured'),
      15000,
      'worker start message',
    );
    check('compiled worker starts and says job processing is not implemented', true);
  } catch (err) {
    check(
      'compiled worker starts and says job processing is not implemented',
      false,
      `${err.message}\n${worker.output()}`,
    );
  }
  await terminate(worker, 'Worker');
}

async function smokeWorkerConfigFailure() {
  const worker = launch('apps/worker/dist/main.js', { LOG_LEVEL: 'loud' });
  const result = await worker.exited;
  check(
    'worker with invalid configuration exits non-zero with an actionable message',
    result.code === 1 && worker.output().includes('LOG_LEVEL'),
    `code=${result.code}`,
  );
}

await smokeApi();
await smokeApiConfigFailure();
await smokeWorker();
await smokeWorkerConfigFailure();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
