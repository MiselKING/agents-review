import type { Queryable } from '@agents-review/db';
import {
  findSyncRun,
  finishSyncRun,
  heartbeatSyncRun,
  listPendingBatches,
  loadBatchMembers,
  snapshotSyncRun,
  type SyncBatchRow,
  updateSyncBatch,
} from '@agents-review/db/sync-runs';
import { isAcceptedEmail } from '@agents-review/shared/ad-platform';

import { type Destination, maskEmails } from './destination.ts';
import type { Policy } from './policy.ts';

export interface WorkerDeps {
  db: Queryable;
  destination: Destination;
  policy: Policy;
  /** Resolves after `ms`, or early when `signal` aborts. Tests resolve at once and record `ms`. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  random: () => number;
  now: () => Date;
  /** Receives log lines. Never given email addresses. */
  log: (line: string) => void;
  /** Aborts on a stop signal: the request in flight finishes, then the worker stops. */
  signal: AbortSignal;
}

export const describeError = (error: unknown) =>
  maskEmails(error instanceof Error ? error.message : String(error));

function retryDelay({ policy, random }: WorkerDeps, attempts: number): number {
  const base = policy.backoffMs[Math.min(attempts, policy.backoffMs.length) - 1] ?? 0;
  return base + Math.floor(random() * policy.jitterMs);
}

/** Sends one batch until it is sent, fails, or the worker is told to stop (it then stays pending). */
async function sendBatch(deps: WorkerDeps, runId: number, audienceId: number, batch: SyncBatchRow) {
  const { db, destination, policy, log, signal } = deps;
  const label = `run ${runId} batch ${batch.batchIndex}`;
  // Customers deleted since the snapshot are left out, and so are emails the platform refuses,
  // so one bad address can't fail the other members of its batch.
  const found = await loadBatchMembers(db, batch.customerIds);
  const members = found
    .filter((member) => isAcceptedEmail(member.email))
    .map((member) => ({ id: String(member.id), email: member.email }));
  if (members.length < found.length) {
    log(`${label}: members left out for an invalid email: ${found.length - members.length}`);
  }
  if (members.length === 0) {
    await updateSyncBatch(db, batch.id, { status: 'sent', nextAttemptAt: null });
    log(`${label}: nothing left to send`);
    return;
  }

  // A resumed batch keeps its schedule.
  const waitUntil = batch.nextAttemptAt ? batch.nextAttemptAt.getTime() - deps.now().getTime() : 0;
  if (waitUntil > 0) await deps.sleep(waitUntil, signal);

  const fail = async (attempts: number, lastError: string) => {
    await updateSyncBatch(db, batch.id, {
      status: 'failed',
      attempts,
      nextAttemptAt: null,
      lastError,
    });
    log(`${label}: failed after ${attempts} attempts: ${lastError}`);
  };
  const markSent = async (attempts: number, note: string) => {
    await updateSyncBatch(db, batch.id, {
      status: 'sent',
      attempts,
      nextAttemptAt: null,
      lastError: null,
    });
    log(`${label}: ${note} (attempt ${attempts})`);
  };

  let attempts = batch.attempts;
  let rateLimitWaitMs = 0;
  while (!signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- each attempt depends on the previous answer
    const outcome = await destination.send(String(audienceId), batch.idempotencyKey, members);

    if (outcome.kind === 'rate_limited') {
      const waitMs = outcome.retryAfterSeconds * 1000;
      if (waitMs > policy.maxRetryAfterMs) {
        // oxlint-disable-next-line no-await-in-loop
        await fail(
          attempts,
          `Rate limited for ${outcome.retryAfterSeconds} s, longer than the ${policy.maxRetryAfterMs / 1000} s the worker waits.`,
        );
        return;
      }
      if (rateLimitWaitMs + waitMs > policy.maxRateLimitWaitMs) {
        // oxlint-disable-next-line no-await-in-loop
        await fail(
          attempts,
          `Rate limited for more than ${policy.maxRateLimitWaitMs / 1000} s in total.`,
        );
        return;
      }
      rateLimitWaitMs += waitMs;
      const nextAttemptAt = new Date(deps.now().getTime() + waitMs);
      // oxlint-disable-next-line no-await-in-loop
      await updateSyncBatch(db, batch.id, { nextAttemptAt, lastError: 'Rate limited.' });
      log(`${label}: rate limited, waiting ${waitMs} ms`);
      // oxlint-disable-next-line no-await-in-loop
      await deps.sleep(waitMs, signal);
      continue;
    }

    const reachedBefore = attempts > 0;
    attempts += 1;
    if (outcome.kind === 'key_reused' && reachedBefore) {
      // The platform kept an earlier attempt of this batch; the resend differs only because
      // members changed since (deleted, or a new email), and members are never removed.
      // oxlint-disable-next-line no-await-in-loop
      await markSent(attempts, 'already delivered by an earlier attempt');
      return;
    }
    if (outcome.kind === 'sent') {
      // oxlint-disable-next-line no-await-in-loop
      await markSent(attempts, `sent ${members.length} members`);
      return;
    }
    if (outcome.kind !== 'retryable' || attempts >= policy.maxAttempts) {
      // oxlint-disable-next-line no-await-in-loop
      await fail(attempts, outcome.error);
      return;
    }
    const waitMs = retryDelay(deps, attempts);
    const nextAttemptAt = new Date(deps.now().getTime() + waitMs);
    // oxlint-disable-next-line no-await-in-loop
    await updateSyncBatch(db, batch.id, { attempts, nextAttemptAt, lastError: outcome.error });
    log(`${label}: attempt ${attempts} failed (${outcome.error}), retrying in ${waitMs} ms`);
    // oxlint-disable-next-line no-await-in-loop
    await deps.sleep(waitMs, signal);
  }
}

/**
 * Processes a run this worker has claimed: snapshots its members (once), sends every pending
 * batch, and records the result. Returns 'stopped' when told to stop first; the run then stays
 * running and is resumed once its heartbeat is stale.
 */
export async function processRun(deps: WorkerDeps, runId: number): Promise<'finished' | 'stopped'> {
  const { db, policy, log, signal } = deps;
  let beating: Promise<void> | undefined;
  const heartbeat = setInterval(() => {
    beating ??= heartbeatSyncRun(db, runId)
      .catch((error: unknown) => log(`run ${runId}: heartbeat failed: ${describeError(error)}`))
      .finally(() => {
        beating = undefined;
      });
  }, policy.heartbeatMs);

  try {
    const run = await findSyncRun(db, runId);
    if (!run) throw new Error(`Sync run ${runId} does not exist.`);
    await snapshotSyncRun(db, runId, policy.batchSize, deps.now());

    for (const batch of await listPendingBatches(db, runId)) {
      if (signal.aborted) break;
      // oxlint-disable-next-line no-await-in-loop -- batches go out one at a time
      await sendBatch(deps, runId, run.audienceId, batch);
    }
    if (signal.aborted) {
      log(`run ${runId}: stopped, it resumes later`);
      return 'stopped';
    }

    const finished = await finishSyncRun(db, runId);
    if (!finished) throw new Error(`Sync run ${runId} still has pending batches.`);
    log(
      `run ${runId}: ${finished.status}, ${finished.syncedCount} of ${finished.memberCount} members synced`,
    );
    return 'finished';
  } finally {
    clearInterval(heartbeat);
    await beating;
  }
}
