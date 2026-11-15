import { claimNextSyncRun } from '@agents-review/db/sync-runs';

import { describeError, processRun, type WorkerDeps } from './process-run.ts';

export interface WorkerSteps {
  claim: () => Promise<{ id: number } | undefined>;
  process: (runId: number) => Promise<unknown>;
}

export type LoopDeps = Pick<WorkerDeps, 'log' | 'policy' | 'signal' | 'sleep'>;

/** Claims and processes runs until the stop signal; waits `pollMs` whenever nothing is queued. */
export async function runLoop(deps: LoopDeps, steps: WorkerSteps): Promise<void> {
  const { log, policy, signal } = deps;
  while (!signal.aborted) {
    let run: { id: number } | undefined;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time
      run = await steps.claim();
    } catch (error) {
      log(`Could not look for queued runs: ${describeError(error)}`);
    }
    if (!run) {
      // oxlint-disable-next-line no-await-in-loop
      await deps.sleep(policy.pollMs, signal);
      continue;
    }

    log(`run ${run.id}: claimed`);
    try {
      // oxlint-disable-next-line no-await-in-loop
      await steps.process(run.id);
    } catch (error) {
      // The run stays running; another pass takes it over once its heartbeat is stale.
      log(`run ${run.id}: stopped by an unexpected error: ${describeError(error)}`);
      // oxlint-disable-next-line no-await-in-loop
      await deps.sleep(policy.pollMs, signal);
    }
  }
}

export function runWorker(deps: WorkerDeps): Promise<void> {
  return runLoop(deps, {
    claim: () => claimNextSyncRun(deps.db, deps.policy.staleSeconds),
    process: (runId) => processRun(deps, runId),
  });
}
