import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import { listAudienceMemberIds } from './audience-members.ts';
import type { AudienceRow } from './audiences.ts';
import type { Queryable } from './client.ts';
import { audiences, customers, syncBatches, syncRuns } from './schema.ts';

export type SyncRunRow = typeof syncRuns.$inferSelect;
export type SyncBatchRow = typeof syncBatches.$inferSelect;

const UNIQUE_VIOLATION = '23505';

/** Whether `error` (or its cause) is Postgres refusing a row because of `constraint`. */
function violates(error: unknown, constraint: string): boolean {
  let current = error;
  while (typeof current === 'object' && current !== null) {
    if (
      'code' in current &&
      current.code === UNIQUE_VIOLATION &&
      'constraint' in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export type StartSyncResult = { ok: true; run: SyncRunRow } | { ok: false; reason: 'in_progress' };

/** Queues a run, unless the audience already has a queued or running one. */
export async function startSyncRun(db: Queryable, audienceId: number): Promise<StartSyncResult> {
  try {
    // A savepoint inside a transaction, so a refused insert doesn't abort the caller's transaction.
    const run = await db.transaction(async (tx) => {
      const [row] = await tx.insert(syncRuns).values({ audienceId }).returning();
      if (!row) throw new Error('Sync run insert returned no row.');
      return row;
    });
    return { ok: true, run };
  } catch (error) {
    if (violates(error, 'sync_runs_one_active_per_audience')) {
      return { ok: false, reason: 'in_progress' };
    }
    throw error;
  }
}

/** A run with its audience, which may be archived since; loaded in one query. */
export type SyncRunWithAudience = SyncRunRow & { audience: AudienceRow };

const runsWithAudience = (db: Queryable) =>
  db
    .select({ run: syncRuns, audience: audiences })
    .from(syncRuns)
    .innerJoin(audiences, eq(audiences.id, syncRuns.audienceId));

const withAudience = ({ run, audience }: { run: SyncRunRow; audience: AudienceRow }) => ({
  ...run,
  audience,
});

export async function findSyncRun(
  db: Queryable,
  id: number,
): Promise<SyncRunWithAudience | undefined> {
  const [row] = await runsWithAudience(db).where(eq(syncRuns.id, id));
  return row && withAudience(row);
}

/** Runs newest first, optionally for one audience, starting after the run id `after`. */
export async function listSyncRuns(
  db: Queryable,
  page: { audienceId?: number; first: number; after?: number },
): Promise<{ runs: SyncRunWithAudience[]; hasNextPage: boolean }> {
  const rows = await runsWithAudience(db)
    .where(
      and(
        page.audienceId === undefined ? undefined : eq(syncRuns.audienceId, page.audienceId),
        page.after === undefined ? undefined : lt(syncRuns.id, page.after),
      ),
    )
    .orderBy(desc(syncRuns.id))
    .limit(page.first + 1);
  return {
    runs: rows.slice(0, page.first).map(withAudience),
    hasNextPage: rows.length > page.first,
  };
}

/** Queued, or running with a heartbeat older than `staleSeconds` (its worker died). */
const claimable = (staleSeconds: number) =>
  sql`(${syncRuns.status} = 'queued' or (${syncRuns.status} = 'running' and (${syncRuns.heartbeatAt} is null or ${syncRuns.heartbeatAt} < now() - make_interval(secs => ${staleSeconds}::int))))`;

const claimValues = {
  status: 'running' as const,
  startedAt: sql`coalesce(${syncRuns.startedAt}, now())`,
  heartbeatAt: sql`now()`,
};

/** Claims the oldest claimable run. Workers skip runs another worker is claiming at that moment. */
export async function claimNextSyncRun(
  db: Queryable,
  staleSeconds: number,
): Promise<SyncRunRow | undefined> {
  const candidate = db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(claimable(staleSeconds))
    .orderBy(asc(syncRuns.createdAt), asc(syncRuns.id))
    .limit(1)
    .for('update', { skipLocked: true });
  // `= (subquery)` runs it once; with `in (subquery)` Postgres may rerun it per row and claim several.
  const [row] = await db
    .update(syncRuns)
    .set(claimValues)
    .where(and(sql`${syncRuns.id} = (${candidate})`, claimable(staleSeconds)))
    .returning();
  return row;
}

/** Claims one run by id; undefined when it isn't claimable or another worker got it first. */
export async function claimSyncRun(
  db: Queryable,
  id: number,
  staleSeconds: number,
): Promise<SyncRunRow | undefined> {
  const [row] = await db
    .update(syncRuns)
    .set(claimValues)
    .where(and(eq(syncRuns.id, id), claimable(staleSeconds)))
    .returning();
  return row;
}

export async function heartbeatSyncRun(db: Queryable, id: number): Promise<void> {
  await db
    .update(syncRuns)
    .set({ heartbeatAt: sql`now()` })
    .where(eq(syncRuns.id, id));
}

/**
 * Resolves the audience's members once and stores them as batches, each with its own
 * idempotency key. Does nothing when the run already has batches, so a resumed run keeps them.
 */
export async function snapshotSyncRun(
  db: Queryable,
  runId: number,
  batchSize: number,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: syncBatches.id })
      .from(syncBatches)
      .where(eq(syncBatches.runId, runId))
      .limit(1);
    if (existing) return;

    // The audience is read even if archived since: the run was started while it was active.
    const [audience] = await tx
      .select({ definition: audiences.definition })
      .from(audiences)
      .innerJoin(syncRuns, eq(syncRuns.audienceId, audiences.id))
      .where(eq(syncRuns.id, runId));
    if (!audience) throw new Error(`Sync run ${runId} has no audience.`);

    const ids = await listAudienceMemberIds(tx, audience.definition, now);
    const batches = [];
    for (let start = 0; start < ids.length; start += batchSize) {
      batches.push({
        runId,
        batchIndex: batches.length,
        customerIds: ids.slice(start, start + batchSize),
      });
    }
    if (batches.length > 0) await tx.insert(syncBatches).values(batches);
    await tx.update(syncRuns).set({ memberCount: ids.length }).where(eq(syncRuns.id, runId));
  });
}

/** The batches still to send, in order. */
export function listPendingBatches(db: Queryable, runId: number): Promise<SyncBatchRow[]> {
  return db
    .select()
    .from(syncBatches)
    .where(and(eq(syncBatches.runId, runId), eq(syncBatches.status, 'pending')))
    .orderBy(asc(syncBatches.batchIndex));
}

/** Id and email of the given customers that still exist, in id order. */
export function loadBatchMembers(
  db: Queryable,
  customerIds: number[],
): Promise<{ id: number; email: string }[]> {
  if (customerIds.length === 0) return Promise.resolve([]);
  return db
    .select({ id: customers.id, email: customers.email })
    .from(customers)
    .where(inArray(customers.id, customerIds))
    .orderBy(asc(customers.id));
}

export async function updateSyncBatch(
  db: Queryable,
  id: number,
  values: Partial<Pick<SyncBatchRow, 'status' | 'attempts' | 'nextAttemptAt' | 'lastError'>>,
): Promise<void> {
  await db.update(syncBatches).set(values).where(eq(syncBatches.id, id));
}

const MAX_ERROR_LENGTH = 500;

/**
 * Ends a run whose batches are all sent or failed: `succeeded` when none failed, otherwise
 * `failed` with a summary. Returns undefined, changing nothing, while batches are still pending.
 */
export async function finishSyncRun(db: Queryable, runId: number): Promise<SyncRunRow | undefined> {
  const totals = await db
    .select({
      status: syncBatches.status,
      batches: sql<number>`count(*)::int`,
      members: sql<number>`coalesce(sum(cardinality(${syncBatches.customerIds})), 0)::int`,
    })
    .from(syncBatches)
    .where(eq(syncBatches.runId, runId))
    .groupBy(syncBatches.status);
  const of = (status: string) => totals.find((row) => row.status === status);
  if (of('pending')) return undefined;

  const failedBatches = of('failed')?.batches ?? 0;
  const totalBatches = totals.reduce((sum, row) => sum + row.batches, 0);
  let error: string | null = null;
  if (failedBatches > 0) {
    const [firstFailed] = await db
      .select({ lastError: syncBatches.lastError })
      .from(syncBatches)
      .where(and(eq(syncBatches.runId, runId), eq(syncBatches.status, 'failed')))
      .orderBy(asc(syncBatches.batchIndex))
      .limit(1);
    const reason = firstFailed?.lastError ? ` First error: ${firstFailed.lastError}` : '';
    error = `${failedBatches} of ${totalBatches} batches failed.${reason}`.slice(
      0,
      MAX_ERROR_LENGTH,
    );
  }

  const [row] = await db
    .update(syncRuns)
    .set({
      status: failedBatches > 0 ? 'failed' : 'succeeded',
      syncedCount: of('sent')?.members ?? 0,
      failedCount: of('failed')?.members ?? 0,
      error,
      finishedAt: sql`now()`,
    })
    .where(eq(syncRuns.id, runId))
    .returning();
  return row;
}
