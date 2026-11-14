import type { AudienceFilter } from '@agents-review/shared/audiences';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { createDb } from './client.ts';
import { inRollback as inRollbackOn, type Tx } from './rollback.ts';
import { audiences, customers, events, syncBatches, syncRuns } from './schema.ts';

const testDefinition: AudienceFilter = {
  version: 1,
  match: 'all',
  conditions: [{ kind: 'attribute', field: 'country', operator: 'is', value: 'DEU' }],
};

const { db, pool } = createDb();
afterAll(() => pool.end());

const inRollback = <T>(run: (tx: Tx) => Promise<T>) => inRollbackOn(db, run);

function findConstraint(error: unknown): string | undefined {
  let current = error;
  while (typeof current === 'object' && current !== null) {
    if ('constraint' in current && typeof current.constraint === 'string') {
      return current.constraint;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

/** The name of the constraint that `run` violated, or undefined when the database accepted it. */
async function violatedConstraint(run: (tx: Tx) => Promise<unknown>): Promise<string | undefined> {
  try {
    await inRollback(run);
  } catch (error) {
    const constraint = findConstraint(error);
    if (constraint === undefined) throw error;
    return constraint;
  }
  return undefined;
}

const customer = (email: string, country = 'DEU') => ({
  email,
  firstName: 'Test',
  lastName: 'Customer',
  country,
});

async function insertAudience(tx: Tx): Promise<number> {
  const [row] = await tx
    .insert(audiences)
    .values({ name: 'Test audience', definition: testDefinition })
    .returning({ id: audiences.id });
  if (!row) throw new Error('Audience insert returned no row.');
  return row.id;
}

async function insertRun(tx: Tx, audienceId: number): Promise<number> {
  const [row] = await tx.insert(syncRuns).values({ audienceId }).returning({ id: syncRuns.id });
  if (!row) throw new Error('Sync run insert returned no row.');
  return row.id;
}

describe('tables and indexes', () => {
  it('has the five tables', async () => {
    const result = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    expect(result.rows.map((row) => row.tablename)).toEqual(
      expect.arrayContaining(['customers', 'events', 'audiences', 'sync_runs', 'sync_batches']),
    );
  });

  it('has the indexes', async () => {
    const result = await db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where schemaname = 'public'`,
    );
    expect(result.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'customers_email_lower_unique',
        'events_customer_type_occurred_idx',
        'events_type_occurred_customer_idx',
        'sync_runs_audience_created_idx',
        'sync_runs_queued_idx',
        'sync_runs_one_active_per_audience',
        'sync_batches_run_batch_unique',
        'sync_batches_idempotency_key_unique',
      ]),
    );
  });
});

describe('customers', () => {
  it('rejects two emails that differ only by letter case', async () => {
    const constraint = await violatedConstraint(async (tx) => {
      await tx.insert(customers).values(customer('Ann@schema-test.example'));
      await tx.insert(customers).values(customer('ann@schema-test.example'));
    });
    expect(constraint).toBe('customers_email_lower_unique');
  });

  it.each(['de', 'Germany', 'DE', 'deu'])('rejects the country %s', async (country) => {
    const constraint = await violatedConstraint((tx) =>
      tx.insert(customers).values(customer('country@schema-test.example', country)),
    );
    expect(constraint).toBe('customers_country_iso3');
  });

  it('sets created_at and updated_at on insert', async () => {
    const row = await inRollback(async (tx) => {
      const [inserted] = await tx
        .insert(customers)
        .values(customer('defaults@schema-test.example'))
        .returning();
      return inserted;
    });
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  it('changes updated_at when a row is updated', async () => {
    const before = new Date('2020-01-01T00:00:00Z');
    const row = await inRollback(async (tx) => {
      const [inserted] = await tx
        .insert(customers)
        .values({ ...customer('updated@schema-test.example'), updatedAt: before })
        .returning({ id: customers.id });
      if (!inserted) throw new Error('Customer insert returned no row.');
      const [updated] = await tx
        .update(customers)
        .set({ firstName: 'Changed' })
        .where(eq(customers.id, inserted.id))
        .returning();
      return updated;
    });
    expect(row?.firstName).toBe('Changed');
    expect(row?.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe('events', () => {
  it('are deleted with their customer', async () => {
    const remaining = await inRollback(async (tx) => {
      const [inserted] = await tx
        .insert(customers)
        .values(customer('events@schema-test.example'))
        .returning({ id: customers.id });
      if (!inserted) throw new Error('Customer insert returned no row.');
      await tx.insert(events).values({
        customerId: inserted.id,
        type: 'purchase',
        occurredAt: new Date(),
        properties: { amount_cents: 1000 },
      });
      await tx.delete(customers).where(eq(customers.id, inserted.id));
      return tx.$count(events, eq(events.customerId, inserted.id));
    });
    expect(remaining).toBe(0);
  });

  it('are rejected without properties', async () => {
    const insert = inRollback(async (tx) => {
      const [inserted] = await tx
        .insert(customers)
        .values(customer('properties@schema-test.example'))
        .returning({ id: customers.id });
      if (!inserted) throw new Error('Customer insert returned no row.');
      await tx.execute(
        sql`insert into events (customer_id, type, occurred_at)
            values (${inserted.id}, 'page_view', now())`,
      );
    });
    // 23502 is Postgres's not-null violation.
    await expect(insert).rejects.toMatchObject({ cause: { code: '23502', column: 'properties' } });
  });
});

describe('sync_runs', () => {
  it('rejects a status outside the allowed values', async () => {
    const constraint = await violatedConstraint(async (tx) => {
      const audienceId = await insertAudience(tx);
      await tx.execute(
        sql`insert into sync_runs (audience_id, status) values (${audienceId}, 'paused')`,
      );
    });
    expect(constraint).toBe('sync_runs_status_check');
  });

  it.each(['queued', 'running'] as const)(
    'rejects a second active run while one is %s',
    async (status) => {
      const constraint = await violatedConstraint(async (tx) => {
        const audienceId = await insertAudience(tx);
        await tx.insert(syncRuns).values({ audienceId, status });
        await tx.insert(syncRuns).values({ audienceId });
      });
      expect(constraint).toBe('sync_runs_one_active_per_audience');
    },
  );

  it('allows a new run once the previous one has finished', async () => {
    const constraint = await violatedConstraint(async (tx) => {
      const audienceId = await insertAudience(tx);
      await tx.insert(syncRuns).values({ audienceId, status: 'succeeded' });
      await tx.insert(syncRuns).values({ audienceId, status: 'failed' });
      await tx.insert(syncRuns).values({ audienceId });
    });
    expect(constraint).toBeUndefined();
  });

  it('refuses to delete an audience that has runs', async () => {
    const constraint = await violatedConstraint(async (tx) => {
      const audienceId = await insertAudience(tx);
      await insertRun(tx, audienceId);
      await tx.delete(audiences).where(eq(audiences.id, audienceId));
    });
    expect(constraint).toBe('sync_runs_audience_id_audiences_id_fk');
  });
});

describe('sync_batches', () => {
  it('rejects a status outside the allowed values', async () => {
    const constraint = await violatedConstraint(async (tx) => {
      const runId = await insertRun(tx, await insertAudience(tx));
      await tx.execute(
        sql`insert into sync_batches (run_id, batch_index, customer_ids, status)
            values (${runId}, 0, '{1,2}', 'done')`,
      );
    });
    expect(constraint).toBe('sync_batches_status_check');
  });

  it('rejects a duplicate idempotency key', async () => {
    const constraint = await violatedConstraint(async (tx) => {
      const runId = await insertRun(tx, await insertAudience(tx));
      const idempotencyKey = '6f1c2a3e-58a4-4c1b-9a40-0d6f3a1b2c3d';
      await tx
        .insert(syncBatches)
        .values({ runId, batchIndex: 0, customerIds: [1], idempotencyKey });
      await tx
        .insert(syncBatches)
        .values({ runId, batchIndex: 1, customerIds: [2], idempotencyKey });
    });
    expect(constraint).toBe('sync_batches_idempotency_key_unique');
  });

  it('rejects the same batch index twice in one run', async () => {
    const constraint = await violatedConstraint(async (tx) => {
      const runId = await insertRun(tx, await insertAudience(tx));
      await tx.insert(syncBatches).values({ runId, batchIndex: 0, customerIds: [1] });
      await tx.insert(syncBatches).values({ runId, batchIndex: 0, customerIds: [2] });
    });
    expect(constraint).toBe('sync_batches_run_batch_unique');
  });

  it('are deleted with their run and keep their customer ids', async () => {
    const result = await inRollback(async (tx) => {
      const runId = await insertRun(tx, await insertAudience(tx));
      const [batch] = await tx
        .insert(syncBatches)
        .values({ runId, batchIndex: 0, customerIds: [3, 1, 2] })
        .returning();
      await tx.delete(syncRuns).where(eq(syncRuns.id, runId));
      return { batch, remaining: await tx.$count(syncBatches, eq(syncBatches.runId, runId)) };
    });
    expect(result.batch?.customerIds).toEqual([3, 1, 2]);
    expect(result.batch?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.remaining).toBe(0);
  });
});
