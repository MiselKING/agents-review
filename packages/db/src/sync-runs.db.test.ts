import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { createDb } from './client.ts';
import { inRollback, type Tx } from './rollback.ts';
import { audiences, syncBatches, syncRuns } from './schema.ts';
import { claimNextSyncRun, findSyncRun, finishSyncRun, listSyncRuns } from './sync-runs.ts';

const { db, pool } = createDb();
afterAll(() => pool.end());

const ALIVE = sql`now()`;

/** A run for a new audience, created in 2000 so it is older than any real run. */
async function runOf(
  tx: Tx,
  values: { status: 'queued' | 'running'; day: number; heartbeatAt?: Date | typeof ALIVE },
) {
  const [audience] = await tx
    .insert(audiences)
    .values({
      name: `Claim test ${values.day} ${Date.now()}`,
      definition: { version: 1, match: 'all', conditions: [] },
    })
    .returning({ id: audiences.id });
  if (!audience) throw new Error('No audience.');
  const createdAt = new Date(Date.UTC(2000, 0, values.day));
  const [run] = await tx
    .insert(syncRuns)
    .values({
      audienceId: audience.id,
      status: values.status,
      createdAt,
      startedAt: values.status === 'running' ? createdAt : null,
      heartbeatAt: values.heartbeatAt,
    })
    .returning();
  if (!run) throw new Error('No run.');
  return run;
}

describe('claimNextSyncRun', () => {
  it('claims the oldest queued or abandoned run, never one whose worker is alive', () =>
    inRollback(db, async (tx) => {
      const alive = await runOf(tx, { status: 'running', day: 1, heartbeatAt: ALIVE });
      const abandoned = await runOf(tx, {
        status: 'running',
        day: 2,
        heartbeatAt: new Date(Date.UTC(2000, 0, 2)),
      });
      const queued = await runOf(tx, { status: 'queued', day: 3 });

      const first = await claimNextSyncRun(tx, 60);
      expect(first).toMatchObject({ id: abandoned.id, status: 'running' });
      // A takeover keeps the time the run first started.
      expect(first?.startedAt).toEqual(abandoned.startedAt);
      expect(first?.heartbeatAt?.getTime()).toBeGreaterThan(Date.UTC(2020, 0, 1));
      const [stillQueued] = await tx.select().from(syncRuns).where(eq(syncRuns.id, queued.id));
      expect(stillQueued?.status).toBe('queued');

      const second = await claimNextSyncRun(tx, 60);
      expect(second).toMatchObject({ id: queued.id, status: 'running' });
      expect(second?.startedAt).toBeInstanceOf(Date);

      // Whatever comes next is someone else's run, or nothing.
      expect((await claimNextSyncRun(tx, 60))?.id).not.toBe(alive.id);
    }));
});

describe('listSyncRuns and findSyncRun', () => {
  it('load each run with its own audience, archived ones included', () =>
    inRollback(db, async (tx) => {
      const one = await runOf(tx, { status: 'queued', day: 1 });
      const two = await runOf(tx, { status: 'queued', day: 2 });
      await tx
        .update(audiences)
        .set({ archivedAt: new Date() })
        .where(eq(audiences.id, one.audienceId));

      const { runs } = await listSyncRuns(tx, { first: 100 });
      const ours = runs.filter((run) => run.id === one.id || run.id === two.id);
      expect(ours.map((run) => [run.id, run.audience.id])).toEqual([
        [two.id, two.audienceId],
        [one.id, one.audienceId],
      ]);
      expect((await findSyncRun(tx, one.id))?.audience.archivedAt).toBeInstanceOf(Date);
    }));
});

describe('finishSyncRun', () => {
  it('fails a run with a failed batch, counting members by batch, and keeps the error short', () =>
    inRollback(db, async (tx) => {
      const run = await runOf(tx, { status: 'running', day: 1, heartbeatAt: ALIVE });
      await tx.insert(syncBatches).values([
        { runId: run.id, batchIndex: 0, customerIds: [1, 2, 3], status: 'sent' },
        {
          runId: run.id,
          batchIndex: 1,
          customerIds: [4, 5],
          status: 'failed',
          lastError: 'x'.repeat(1000),
        },
      ]);

      const finished = await finishSyncRun(tx, run.id);
      expect(finished).toMatchObject({ status: 'failed', syncedCount: 3, failedCount: 2 });
      expect(finished?.error).toMatch(/^1 of 2 batches failed\. First error: x+$/);
      expect(finished?.error).toHaveLength(500);
      expect(finished?.finishedAt).toBeInstanceOf(Date);
    }));

  it('leaves a run with pending batches unchanged', () =>
    inRollback(db, async (tx) => {
      const run = await runOf(tx, { status: 'running', day: 1, heartbeatAt: ALIVE });
      await tx.insert(syncBatches).values({ runId: run.id, batchIndex: 0, customerIds: [1] });
      expect(await finishSyncRun(tx, run.id)).toBeUndefined();
      expect((await findSyncRun(tx, run.id))?.status).toBe('running');
    }));
});
