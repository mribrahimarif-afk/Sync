// Starts the API, worker and web app together and guarantees they are all stopped together
// (including their child processes). See supervisor.mjs for how cleanup works.
import { spawnSync } from 'node:child_process';
import { supervise } from './supervisor.mjs';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

// Shared contracts are consumed from their compiled output, so build them once up front.
const contracts = spawnSync(npm, ['run', 'build:contracts'], {
  stdio: 'inherit',
  shell: isWindows,
});
if (contracts.status !== 0) {
  console.error('[dev] Building @sync/contracts failed; not starting services.');
  process.exit(contracts.status ?? 1);
}

const { done, stop } = supervise(
  ['api', 'worker', 'web'].map((name) => ({
    name,
    command: npm,
    args: ['run', 'dev', '-w', `@sync/${name}`],
    shell: isWindows,
  })),
);

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  try {
    process.on(signal, () => stop(signal, 0));
  } catch {
    // Signal not supported on this platform.
  }
}

process.exit(await done);
