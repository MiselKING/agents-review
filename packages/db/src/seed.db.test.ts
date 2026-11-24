import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDb } from './client.ts';
import { customers, events } from './schema.ts';
import {
  SEED_CUSTOMER_COUNT,
  SEED_EVENT_WINDOW_DAYS,
  SEED_PAGE_VIEW_COUNT,
  SEED_PURCHASE_COUNT,
} from './seed-data.ts';
import { seedDatabase } from './seed-database.ts';

const { db, pool } = createDb();
afterAll(() => pool.end());

async function snapshot() {
  const result = await db.execute<{ customers: string; events: string; checksum: string }>(sql`
    select
      (select count(*) from ${customers}) as customers,
      (select count(*) from ${events}) as events,
      (select md5(string_agg(${events.id} || ':' || ${events.customerId} || ':' || ${events.type}
        || ':' || ${events.occurredAt} || ':' || ${events.properties}, ',' order by ${events.id}))
        from ${events}) as checksum
  `);
  return result.rows[0];
}

const now = new Date();
let first: Awaited<ReturnType<typeof snapshot>>;

// Every test here reads rows seeded from `now`, whichever tests run.
beforeAll(async () => {
  await seedDatabase(db, now);
  first = await snapshot();
}, 30_000);

describe('seedDatabase', () => {
  it('loads the same rows every time it runs, in under 30 seconds', async () => {
    const started = Date.now();
    await seedDatabase(db, now);
    expect(Date.now() - started).toBeLessThan(30_000);
    const second = await snapshot();

    expect(first?.customers).toBe(String(SEED_CUSTOMER_COUNT));
    expect(first?.events).toBe(String(SEED_PURCHASE_COUNT + SEED_PAGE_VIEW_COUNT));
    expect(first?.checksum).toHaveLength(32);
    expect(second).toEqual(first);
  }, 60_000);

  it('loads purchases and page views across 10 countries', async () => {
    const byType = await db
      .select({ type: events.type, count: sql<number>`count(*)::int` })
      .from(events)
      .groupBy(events.type);
    expect(byType).toEqual(
      expect.arrayContaining([
        { type: 'purchase', count: SEED_PURCHASE_COUNT },
        { type: 'page_view', count: SEED_PAGE_VIEW_COUNT },
      ]),
    );

    const countries = await db.selectDistinct({ country: customers.country }).from(customers);
    expect(countries).toHaveLength(10);
  });

  it('keeps every event within the 180 days before the seed ran', async () => {
    const [range] = await db
      .select({
        earliest: sql<Date>`min(${events.occurredAt})`.mapWith(events.occurredAt),
        latest: sql<Date>`max(${events.occurredAt})`.mapWith(events.occurredAt),
      })
      .from(events);
    const windowStart = now.getTime() - SEED_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(range?.earliest.getTime()).toBeGreaterThanOrEqual(windowStart);
    expect(range?.latest.getTime()).toBeLessThanOrEqual(now.getTime());
  });
});
