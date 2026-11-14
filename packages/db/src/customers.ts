import { asc } from 'drizzle-orm';

import type { Queryable } from './client.ts';
import { customers } from './schema.ts';

/** Every country code at least one customer has, in code order. */
export async function listCustomerCountries(db: Queryable): Promise<string[]> {
  const rows = await db
    .selectDistinct({ country: customers.country })
    .from(customers)
    .orderBy(asc(customers.country));
  return rows.map((row) => row.country);
}
