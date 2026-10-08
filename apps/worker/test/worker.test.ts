import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/logger.js';
import { createWorker } from '../src/worker.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, text: () => lines.join(''), records: () => lines.map((l) => JSON.parse(l)) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('worker lifecycle', () => {
  it('states honestly that job processing is not implemented', () => {
    vi.useFakeTimers();
    const logs = capture();
    const worker = createWorker(createLogger({ logLevel: 'info' }, logs.stream));

    worker.start();

    const [started] = logs.records();
    expect(started.msg).toMatch(/not implemented or configured/);
    expect(started.msg).toMatch(/no queue, database or schedule/);
    void worker.stop();
  });

  it('holds exactly one handle while running and releases it on stop', async () => {
    vi.useFakeTimers();
    const worker = createWorker(createLogger({ logLevel: 'silent' }));

    expect(vi.getTimerCount()).toBe(0);
    worker.start();
    expect(vi.getTimerCount()).toBe(1);
    await worker.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is idempotent on repeated stop and refuses a second start', async () => {
    vi.useFakeTimers();
    const logs = capture();
    const worker = createWorker(createLogger({ logLevel: 'info' }, logs.stream));

    worker.start();
    expect(() => worker.start()).toThrow(/cannot start/);
    await worker.stop();
    await worker.stop();

    expect(logs.records().filter((r) => r.msg === 'Sync worker stopped')).toHaveLength(1);
    expect(() => worker.start()).toThrow(/cannot start/);
  });

  it('stop before start does nothing', async () => {
    vi.useFakeTimers();
    const worker = createWorker(createLogger({ logLevel: 'silent' }));
    await worker.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('worker logging', () => {
  it('emits structured JSON and redacts secrets', () => {
    const logs = capture();
    const logger = createLogger({ logLevel: 'info' }, logs.stream);

    logger.info({ token: 'secret-1', headers: { cookie: 'secret-2' }, job: 'visible' }, 'event');

    const [record] = logs.records();
    expect(record).toMatchObject({ service: 'sync-worker', job: 'visible', msg: 'event' });
    expect(logs.text()).not.toMatch(/secret-\d/);
    expect(logs.text()).toContain('[Redacted]');
  });
});
