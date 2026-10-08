// Test fixture: a "service" that starts a descendant HTTP server, then behaves per MODE.
//   exit1 - parent exits with code 1 while the descendant keeps running
//   exit0 - parent exits normally while the descendant keeps running
//   hang  - parent keeps running
import { spawn } from 'node:child_process';
import net from 'node:net';

const [mode, port] = process.argv.slice(2);

spawn(
  process.execPath,
  [
    '-e',
    `require('node:http').createServer((q, r) => r.end('ok')).listen(${Number(port)}, '127.0.0.1')`,
  ],
  { stdio: 'ignore' },
);

function portOpen() {
  return new Promise((resolve) => {
    const socket = net.connect(Number(port), '127.0.0.1');
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
  });
}

while (!(await portOpen())) await new Promise((r) => setTimeout(r, 100));
console.log('ready');

if (mode === 'exit1') process.exit(1);
if (mode === 'exit0') process.exit(0);
setInterval(() => {}, 1 << 30);
