import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { createDb } from './client.ts';
import { inRollback } from './rollback.ts';
import { SAMPLE_AUDIENCES, seedSampleAudiences } from './sample-audiences.ts';
import { audiences } from './schema.ts';

const { db, pool } = createDb();
afterAll(() => pool.end());

describe('seedSampleAudiences', () => {
  it('adds the samples to an empty table, then adds none on a second run', async () => {
    const result = await inRollback(db, async (tx) => {
      // Rolled back: runs reference audiences, so they go first.
      await tx.execute(sql`delete from sync_batches`);
      await tx.execute(sql`delete from sync_runs`);
      await tx.delete(audiences);
      const first = await seedSampleAudiences(tx);
      const second = await seedSampleAudiences(tx);
      const names = await tx.select({ name: audiences.name }).from(audiences);
      return { first, second, names: names.map((row) => row.name) };
    });
    expect(result.first).toBe(SAMPLE_AUDIENCES.length);
    expect(result.second).toBe(0);
    expect(result.names.toSorted()).toEqual(SAMPLE_AUDIENCES.map((a) => a.name).toSorted());
  });

  it('adds none and changes none when any audience exists', async () => {
    const result = await inRollback(db, async (tx) => {
      await tx.execute(sql`delete from sync_batches`);
      await tx.execute(sql`delete from sync_runs`);
      await tx.delete(audiences);
      const [own] = await tx
        .insert(audiences)
        .values({ name: 'Made by hand', definition: SAMPLE_AUDIENCES[0]!.definition })
        .returning();
      const added = await seedSampleAudiences(tx);
      const rows = await tx.select().from(audiences);
      return { added, own, rows };
    });
    expect(result.added).toBe(0);
    expect(result.rows).toEqual([result.own]);
  });
});
