import type {
  AudienceFilter,
  FilterCondition,
  TimeWindow,
  WindowUnit,
} from '@agents-review/shared/audience-filter';
import { and, asc, eq, gt, gte, lt, ne, or, type SQL, sql } from 'drizzle-orm';

import type { Queryable } from './client.ts';
import { customers, events } from './schema.ts';

export interface MemberRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
}

export interface MemberPage {
  members: MemberRow[];
  hasNextPage: boolean;
}

// Values are bound parameters; only these fixed snippets shape the SQL.
const INTERVALS: Record<WindowUnit, (amount: number) => SQL> = {
  day: (amount) => sql`make_interval(days => ${amount}::int)`,
  week: (amount) => sql`make_interval(weeks => ${amount}::int)`,
  month: (amount) => sql`make_interval(months => ${amount}::int)`,
};

const cutoff = (window: TimeWindow, now: Date) =>
  sql`(${now.toISOString()}::timestamptz - ${INTERVALS[window.unit](window.amount)})`;

function conditionSql(condition: FilterCondition, now: Date): SQL {
  if (condition.kind === 'attribute') {
    return condition.operator === 'is'
      ? eq(customers.country, condition.value)
      : ne(customers.country, condition.value);
  }
  if (condition.kind === 'signed_up') {
    const since = cutoff(condition.window, now);
    return condition.operator === 'within_last'
      ? gte(customers.createdAt, since)
      : lt(customers.createdAt, since);
  }
  const matching = sql`select 1 from ${events}
    where ${events.customerId} = ${customers.id}
      and ${events.type} = ${condition.eventType}
      and ${events.occurredAt} >= ${cutoff(condition.window, now)}`;
  return condition.operator === 'performed'
    ? sql`exists (${matching})`
    : sql`not exists (${matching})`;
}

/** The WHERE condition on `customers` for an audience filter, with windows ending at `now`. */
export function audienceFilterSql(filter: AudienceFilter, now: Date): SQL {
  const parts = filter.conditions.map((condition) => conditionSql(condition, now));
  const combined = filter.match === 'all' ? and(...parts) : or(...parts);
  if (!combined) throw new Error('An audience filter needs at least one condition.');
  return combined;
}

export function countAudienceMembers(
  db: Queryable,
  filter: AudienceFilter,
  now: Date,
): Promise<number> {
  return db.$count(customers, audienceFilterSql(filter, now));
}

/** One page of members ordered by customer id, starting after the id `after`. */
export async function listAudienceMembers(
  db: Queryable,
  filter: AudienceFilter,
  page: { first: number; after?: number },
  now: Date,
): Promise<MemberPage> {
  const where = audienceFilterSql(filter, now);
  const rows = await db
    .select({
      id: customers.id,
      email: customers.email,
      firstName: customers.firstName,
      lastName: customers.lastName,
      country: customers.country,
    })
    .from(customers)
    .where(page.after === undefined ? where : and(where, gt(customers.id, page.after)))
    .orderBy(asc(customers.id))
    .limit(page.first + 1);
  return { members: rows.slice(0, page.first), hasNextPage: rows.length > page.first };
}
