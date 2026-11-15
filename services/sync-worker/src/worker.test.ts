import { describe, expect, it } from 'vitest';

import { DEFAULT_POLICY } from './policy.ts';
import { type LoopDeps, runLoop } from './worker.ts';

function fakeDeps() {
  const controller = new AbortController();
  const sleeps: number[] = [];
  const lines: string[] = [];
  const deps: LoopDeps = {
    policy: DEFAULT_POLICY,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    log: (line) => lines.push(line),
    signal: controller.signal,
  };
  return { deps, controller, sleeps, lines };
}

describe('runLoop', () => {
  it('looks for queued runs every 2 seconds and processes each one it claims', async () => {
    const { deps, controller, sleeps } = fakeDeps();
    const claims = [undefined, undefined, { id: 7 }, { id: 8 }];
    const processed: number[] = [];

    await runLoop(deps, {
      claim: () => {
        if (claims.length === 0) controller.abort();
        return Promise.resolve(claims.shift());
      },
      process: (runId) => {
        processed.push(runId);
        return Promise.resolve();
      },
    });

    expect(processed).toEqual([7, 8]);
    expect(sleeps).toEqual([2000, 2000, 2000]);
  });

  it('keeps going after the database or a run fails unexpectedly', async () => {
    const { deps, controller, lines } = fakeDeps();
    let calls = 0;

    await runLoop(deps, {
      claim: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('connection refused'));
        if (calls === 2) return Promise.resolve({ id: 9 });
        controller.abort();
        return Promise.resolve(undefined);
      },
      process: () => Promise.reject(new Error('lost ann@example.com')),
    });

    expect(calls).toBe(3);
    expect(lines).toContain('Could not look for queued runs: connection refused');
    expect(lines).toContain('run 9: stopped by an unexpected error: lost [email]');
  });

  it('stops at once when already told to stop', async () => {
    const { deps, controller } = fakeDeps();
    controller.abort();
    let claimed = false;
    await runLoop(deps, {
      claim: () => {
        claimed = true;
        return Promise.resolve(undefined);
      },
      process: () => Promise.resolve(),
    });
    expect(claimed).toBe(false);
  });
});
