// Starts the API, worker and web app together and guarantees they are all stopped together.
//
// Why a custom runner: on Windows, stopping a parent npm/cmd process does not stop the
// grandchildren (tsx, next), which then keep ports bound. Each service is therefore killed as
// a whole process tree: `taskkill /T` on Windows, a process group elsewhere.
import { spawn, spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const services = [
  { name: 'api', workspace: '@sync/api' },
  { name: 'worker', workspace: '@sync/worker' },
  { name: 'web', workspace: '@sync/web' },
];

// Shared contracts are consumed from their compiled output, so build them once up front.
const contracts = spawnSync(npm, ['run', 'build:contracts'], {
  stdio: 'inherit',
  shell: isWindows,
});
if (contracts.status !== 0) {
  console.error('[dev] Building @sync/contracts failed; not starting services.');
  process.exit(contracts.status ?? 1);
}

const children = new Map();
let stopping = false;
let exitCode = 0;

function prefixLines(name, stream, target) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (pending + chunk).split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) target.write(`[${name}] ${line}\n`);
  });
  stream.on('end', () => {
    if (pending) target.write(`[${name}] ${pending}\n`);
  });
}

function killTree(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    if (isWindows) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    // Already gone.
  }
}

function stopAll(reason, code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  console.log(`[dev] Stopping all services (${reason})...`);
  for (const child of children.values()) killTree(child);
  // Escalate for anything that ignores SIGTERM, then leave regardless.
  setTimeout(() => {
    for (const child of children.values()) killTree(child, 'SIGKILL');
    process.exit(exitCode);
  }, 8000).unref();
  if (children.size === 0) process.exit(exitCode);
}

for (const { name, workspace } of services) {
  const child = spawn(npm, ['run', 'dev', '-w', workspace], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
    detached: !isWindows, // own process group so the whole tree can be signalled
  });
  children.set(name, child);
  prefixLines(name, child.stdout, process.stdout);
  prefixLines(name, child.stderr, process.stderr);

  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!stopping) {
      console.error(`[dev] ${name} exited unexpectedly (${signal ?? `code ${code}`}).`);
      stopAll(`${name} exited`, 1);
    } else if (children.size === 0) {
      process.exit(exitCode);
    }
  });
  child.on('error', (err) => {
    console.error(`[dev] Could not start ${name}: ${err.message}`);
    stopAll(`${name} failed to start`, 1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  try {
    process.on(signal, () => stopAll(signal, 0));
  } catch {
    // Signal not supported on this platform.
  }
}

// Last resort if this process is torn down some other way.
process.on('exit', () => {
  for (const child of children.values()) killTree(child, 'SIGKILL');
});
