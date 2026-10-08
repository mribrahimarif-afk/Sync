// Runs several long-lived services and guarantees that when any one stops (or stop() is
// called) EVERY service, including all of its descendants, is gone before `done` resolves.
//
// Ownership of a service's process tree is kept after its parent process exits: a parent can
// die and leave children (a dev server, a file watcher) running and holding ports.
//   POSIX:   each service gets its own process group; the group outlives its leader, so it is
//            signalled by group id and polled until empty.
//   Windows: orphaned children keep their dead parent's PID as ParentProcessId, so the tree is
//            rebuilt from the process table (children must be newer than the service start, which
//            guards against PID reuse) and force-stopped.
import { spawn, spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function killGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch {
    // Group already empty.
  }
}

/** Force-stops `rootPid` and every process descended from it that started after `sinceMs`. */
function killWindowsTree(rootPid, sinceMs) {
  const script = [
    `$since = [DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(sinceMs)}).LocalDateTime`,
    `$ids = New-Object 'System.Collections.Generic.HashSet[int]'`,
    `[void]$ids.Add(${Number(rootPid)})`,
    `$all = @(Get-CimInstance Win32_Process)`,
    `do { $added = $false; foreach ($p in $all) {`,
    `  if (-not $ids.Contains([int]$p.ProcessId) -and $ids.Contains([int]$p.ParentProcessId) -and $p.CreationDate -ge $since) {`,
    `    [void]$ids.Add([int]$p.ProcessId); $added = $true } } } while ($added)`,
    `foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }`,
  ].join('\n');
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
  });
}

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

/**
 * @param {{name: string, command: string, args?: string[], shell?: boolean, env?: object}[]} services
 * @param {{ out?: NodeJS.WritableStream, err?: NodeJS.WritableStream, killTimeoutMs?: number }} [options]
 * @returns {{ done: Promise<number>, stop: (reason?: string, code?: number) => void }}
 *   `done` resolves with the exit code once every service tree is verified gone.
 */
export function supervise(
  services,
  { out = process.stdout, err = process.stderr, killTimeoutMs = 8000 } = {},
) {
  const running = [];
  let stopping = false;
  let exitCode = 0;
  let resolveDone;
  const done = new Promise((resolve) => (resolveDone = resolve));

  async function cleanup(entry) {
    const { child, startedAt } = entry;
    if (isWindows) {
      killWindowsTree(child.pid, startedAt - 2000);
      return;
    }
    killGroup(child.pid, 'SIGTERM');
    const deadline = Date.now() + killTimeoutMs;
    while (groupAlive(child.pid) && Date.now() < deadline) await sleep(50);
    if (groupAlive(child.pid)) {
      killGroup(child.pid, 'SIGKILL');
      while (groupAlive(child.pid) && Date.now() < deadline + 2000) await sleep(50);
    }
  }

  function stop(reason = 'stop requested', code = 0) {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    out.write(`[dev] Stopping all services (${reason})...\n`);
    // Every service is cleaned up, including ones whose parent already exited.
    Promise.all(running.map(cleanup)).then(
      () => resolveDone(exitCode),
      () => resolveDone(1),
    );
  }

  for (const service of services) {
    const child = spawn(service.command, service.args ?? [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: service.shell ?? false,
      detached: !isWindows, // own process group so the whole tree can be signalled
      env: { ...process.env, ...service.env },
    });
    running.push({ name: service.name, child, startedAt: Date.now() });
    prefixLines(service.name, child.stdout, out);
    prefixLines(service.name, child.stderr, err);

    child.on('exit', (code, signal) => {
      if (!stopping) {
        err.write(`[dev] ${service.name} exited unexpectedly (${signal ?? `code ${code}`}).\n`);
        stop(`${service.name} exited`, 1);
      }
    });
    child.on('error', (error) => {
      err.write(`[dev] Could not start ${service.name}: ${error.message}\n`);
      stop(`${service.name} failed to start`, 1);
    });
  }

  return { done, stop };
}
