import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { createDb } from './client.ts';
import { inRollback, type Tx } from './rollback.ts';
import { audiences, syncRuns } from './schema.ts';
import { claimNextSyncRun } from './sync-runs.ts';

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
