import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

import { main, sleep } from './main.ts';
import { DEFAULT_POLICY } from './policy.ts';
import type { WorkerDeps } from './process-run.ts';

const ENV = {
  SYNC_DESTINATION_URL: 'http://localhost:4199',
  // Never connected to: the tests replace the loop that would query it.
  DATABASE_URL: 'postgres://worker@localhost:1/none',
};

function setup(env: Record<string, string | undefined> = ENV) {
  const signals = new EventEmitter();
  const lines: string[] = [];
  const errors: string[] = [];
  const { promise: running, resolve: started } = Promise.withResolvers<WorkerDeps>();
  // Runs until told to stop, like the real loop.
  const run = vi.fn<(deps: WorkerDeps) => Promise<void>>(
    (deps) =>
      new Promise((resolve) => {
        started(deps);
        deps.signal.addEventListener('abort', () => resolve());
      }),
  );
  const exit = main({
    env,
    signals,
    log: (line) => lines.push(line),
    logError: (line) => errors.push(line),
    run,
  });
  return { signals, lines, errors, run, running, exit };
}

describe('main', () => {
  it.each([
    [
      'without a destination',
      { DATABASE_URL: ENV.DATABASE_URL },
      'Missing environment variable SYNC_DESTINATION_URL',
    ],
    [
      'with a destination that is not http',
      { ...ENV, SYNC_DESTINATION_URL: 'ftp://localhost' },
      'SYNC_DESTINATION_URL must be an http or https URL, got "ftp://localhost".',
    ],
    [
      'without a database',
      { SYNC_DESTINATION_URL: ENV.SYNC_DESTINATION_URL },
      'Missing environment variable DATABASE_URL',
    ],
  ])('exits with 1 %s, before starting', async (_label, env, message) => {
    const { errors, run, exit } = setup(env);
    expect(await exit).toBe(1);
    expect(errors.join('\n')).toContain(message);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['SIGINT', 'SIGTERM'])('stops on %s and exits with 0', async (signal) => {
    const { signals, lines, running, exit } = setup();
    const deps = await running;
    expect(deps.policy).toBe(DEFAULT_POLICY);
    expect(deps.signal.aborted).toBe(false);

    signals.emit(signal);

    expect(await exit).toBe(0);
    expect(deps.signal.aborted).toBe(true);
    expect(lines).toEqual([
      'Sync worker started, sending to http://localhost:4199',
      `Sync worker stopping (${signal}); finishing the request in flight`,
      'Sync worker stopped',
    ]);
    expect(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM')).toBe(0);
  });

  it('removes its signal handlers when the loop fails', async () => {
    const signals = new EventEmitter();
    const exit = main({
      env: ENV,
      signals,
      log: () => {},
      run: () => Promise.reject(new Error('boom')),
    });
    await expect(exit).rejects.toThrow('boom');
    expect(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM')).toBe(0);
  });
});

describe('sleep', () => {
  it('ends early, without an error, when told to stop', async () => {
    const controller = new AbortController();
    const waiting = sleep(60_000, controller.signal);
    controller.abort();
    // An aborted sleep settles before the next turn of the event loop; a running timer would not.
    const nextTurn = new Promise<'still waiting'>((resolve) => {
      setImmediate(() => resolve('still waiting'));
    });
    expect(await Promise.race([waiting, nextTurn])).toBeUndefined();
  });
});

describe('index.ts', () => {
  it('exits the process with 1 and a clear message when a setting is missing', async () => {
    const index = fileURLToPath(new URL('index.ts', import.meta.url));
    const env = { ...process.env, SYNC_DESTINATION_URL: '' };
    const failure: unknown = await promisify(execFile)(process.execPath, [index], { env }).then(
      () => new Error('The worker started.'),
      (error: unknown) => error,
    );
    if (!(failure instanceof Error)) throw new Error('Expected the process to fail.');
    expect(failure).toMatchObject({ code: 1 });
    expect(Reflect.get(failure, 'stderr')).toContain(
      'Missing environment variable SYNC_DESTINATION_URL',
    );
  });
});
