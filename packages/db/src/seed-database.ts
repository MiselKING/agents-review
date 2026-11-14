import { sql } from 'drizzle-orm';

import type { Db } from './client.ts';
import { seedSampleAudiences } from './sample-audiences.ts';
import { customers, events } from './schema.ts';
import { generateSeedData } from './seed-data.ts';

// Postgres allows 65,535 bound values per statement; these stay well under it.
const CUSTOMER_BATCH = 2000;
const EVENT_BATCH = 5000;

/**
 * Replaces all customers and events with the seed rows, and adds sample audiences when there are
 * none. Existing audiences and sync runs are kept.
 */
export async function seedDatabase(db: Db, now: Date = new Date()) {
  const data = generateSeedData(now);

  return db.transaction(async (tx) => {
    // Restarting the identities gives the same ids on every run.
    await tx.execute(sql`truncate table ${events}, ${customers} restart identity`);

    // Batches run one after another: they share one transaction and connection.
    /* oxlint-disable no-await-in-loop */
    const customerIds: number[] = [];
    for (let start = 0; start < data.customers.length; start += CUSTOMER_BATCH) {
      const inserted = await tx
        .insert(customers)
        .values(data.customers.slice(start, start + CUSTOMER_BATCH))
        .returning({ id: customers.id });
      for (const row of inserted) customerIds.push(row.id);
    }

    for (let start = 0; start < data.events.length; start += EVENT_BATCH) {
      const rows = data.events.slice(start, start + EVENT_BATCH).map((event) => {
        const customerId = customerIds[event.customerIndex];
        if (customerId === undefined) {
          throw new Error(`Seed event points at missing customer ${event.customerIndex}.`);
        }
        return {
          customerId,
          type: event.type,
          occurredAt: event.occurredAt,
          properties: event.properties,
        };
      });
      await tx.insert(events).values(rows);
    }
    /* oxlint-enable no-await-in-loop */

    const audiences = await seedSampleAudiences(tx);
    return { customers: data.customers.length, events: data.events.length, audiences };
  });
}
