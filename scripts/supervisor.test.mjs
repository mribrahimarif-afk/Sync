// Run with: node --test scripts/
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { supervise } from './supervisor.mjs';

const fixture = fileURLToPath(new URL('./fixtures/service-with-child.mjs', import.meta.url));
const quiet = () => new Writable({ write: (_c, _e, cb) => cb() });

async function freePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
  });
}

async function waitFor(predicate, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail('condition not reached in time');
}

function start(mode, port) {
  return supervise(
    [{ name: 'svc', command: process.execPath, args: [fixture, mode, String(port)] }],
    { out: quiet(), err: quiet(), killTimeoutMs: 5000 },
  );
}

for (const [mode, expectedCode] of [
  ['exit1', 1],
  ['exit0', 1], // a dev service stopping on its own is always treated as a failure
]) {
  test(
    `parent ${mode}: descendants are cleaned up before the supervisor finishes`,
    { timeout: 60000 },
    async () => {
      const port = await freePort();
      const { done } = start(mode, port);

      assert.equal(await done, expectedCode);
      assert.equal(await portOpen(port), false, 'descendant server must not survive');
    },
  );
}

test('stop(): shuts down a running service and its descendants', { timeout: 60000 }, async () => {
  const port = await freePort();
  const { done, stop } = start('hang', port);
  await waitFor(() => portOpen(port));

  stop('test', 0);

  assert.equal(await done, 0);
  assert.equal(await portOpen(port), false, 'descendant server must not survive');
});

test('one failing service stops the healthy one too', { timeout: 60000 }, async () => {
  const [healthyPort, failingPort] = [await freePort(), await freePort()];
  const { done } = supervise(
    [
      { name: 'healthy', command: process.execPath, args: [fixture, 'hang', String(healthyPort)] },
      { name: 'failing', command: process.execPath, args: [fixture, 'exit1', String(failingPort)] },
    ],
    { out: quiet(), err: quiet(), killTimeoutMs: 5000 },
  );

  assert.equal(await done, 1);
  assert.equal(await portOpen(healthyPort), false);
  assert.equal(await portOpen(failingPort), false);
});
