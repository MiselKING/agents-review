import type { AudienceFilter, FilterCondition, TimeWindow } from '@agents-review/shared/audiences';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { countAudienceMembers, listAudienceMembers } from './audience-members.ts';
import { createDb } from './client.ts';
import { customers, events } from './schema.ts';

const { db, pool } = createDb();
afterAll(() => pool.end());

const now = new Date();
let allCustomers: { id: number; country: string; createdAt: Date }[] = [];
let allEvents: { customerId: number; type: string; occurredAt: Date }[] = [];

beforeAll(async () => {
  allCustomers = await db
    .select({ id: customers.id, country: customers.country, createdAt: customers.createdAt })
    .from(customers);
  allEvents = await db
    .select({ customerId: events.customerId, type: events.type, occurredAt: events.occurredAt })
    .from(events);
});

// Calendar math (month lengths, time zone) comes from Postgres, written differently from the
// code under test; which customers match is decided here in plain TypeScript.
async function cutoffFor(window: TimeWindow): Promise<Date> {
  const interval = `${window.amount} ${window.unit}s`;
  const result = await db.execute<{ cutoff: Date | string }>(
    sql`select (${now.toISOString()}::timestamptz - ${interval}::interval) as cutoff`,
  );
  const value = result.rows[0]?.cutoff;
  if (value === undefined) throw new Error('No cutoff returned.');
  return new Date(value);
}

async function referenceMatcher(condition: FilterCondition) {
  if (condition.kind === 'attribute') {
    return (customer: (typeof allCustomers)[number]) =>
      condition.operator === 'is'
        ? customer.country === condition.value
        : customer.country !== condition.value;
  }
  const since = await cutoffFor(condition.window);
  if (condition.kind === 'signed_up') {
    return (customer: (typeof allCustomers)[number]) =>
      condition.operator === 'within_last'
        ? customer.createdAt >= since
        : customer.createdAt < since;
  }
  const active = new Set(
    allEvents
      .filter((event) => event.type === condition.eventType && event.occurredAt >= since)
      .map((event) => event.customerId),
  );
  return (customer: (typeof allCustomers)[number]) =>
    condition.operator === 'performed' ? active.has(customer.id) : !active.has(customer.id);
}

async function referenceMembers(filter: AudienceFilter): Promise<number[]> {
  const matchers = await Promise.all(filter.conditions.map(referenceMatcher));
  return allCustomers
    .filter((customer) =>
      filter.match === 'all'
        ? matchers.every((matches) => matches(customer))
        : matchers.some((matches) => matches(customer)),
    )
    .map((customer) => customer.id)
    .toSorted((a, b) => a - b);
}

async function allMemberIds(filter: AudienceFilter, first: number): Promise<number[]> {
  const ids: number[] = [];
  let after: number | undefined;
  for (;;) {
    // Pages depend on the previous page's last id.
    // oxlint-disable-next-line no-await-in-loop
    const page = await listAudienceMembers(db, filter, { first, after }, now);
    ids.push(...page.members.map((member) => member.id));
    after = page.members.at(-1)?.id;
    if (!page.hasNextPage) return ids;
  }
}

const filterOf = (
  conditions: FilterCondition[],
  match: AudienceFilter['match'] = 'all',
): AudienceFilter => ({ version: 1, match, conditions });

const countryIsDeu: FilterCondition = {
  kind: 'attribute',
  field: 'country',
  operator: 'is',
  value: 'DEU',
};
const purchasedWithin30Days: FilterCondition = {
  kind: 'event',
  eventType: 'purchase',
  operator: 'performed',
  window: { amount: 30, unit: 'day' },
};
const noPurchaseWithin3Months: FilterCondition = {
  kind: 'event',
  eventType: 'purchase',
  operator: 'not_performed',
  window: { amount: 3, unit: 'month' },
};

const conditions: Record<string, FilterCondition> = {
  'country is': countryIsDeu,
  'country is not': { kind: 'attribute', field: 'country', operator: 'is_not', value: 'DEU' },
  'signed up within the last 12 months': {
    kind: 'signed_up',
    operator: 'within_last',
    window: { amount: 12, unit: 'month' },
  },
  'signed up more than 300 days ago': {
    kind: 'signed_up',
    operator: 'more_than_ago',
    window: { amount: 300, unit: 'day' },
  },
  'purchased within 30 days': purchasedWithin30Days,
  'viewed a page within 2 weeks': {
    kind: 'event',
    eventType: 'page_view',
    operator: 'performed',
    window: { amount: 2, unit: 'week' },
  },
  'no purchase within 3 months': noPurchaseWithin3Months,
};

describe('countAudienceMembers', () => {
  it.each(Object.entries(conditions))(
    'matches the reference for "%s"',
    async (_name, condition) => {
      const filter = filterOf([condition]);
      const expected = await referenceMembers(filter);
      expect(expected.length).toBeGreaterThan(0);
      expect(await countAudienceMembers(db, filter, now)).toBe(expected.length);
    },
  );

  it('with match all, requires every condition', async () => {
    const filter = filterOf([countryIsDeu, purchasedWithin30Days]);
    expect(await countAudienceMembers(db, filter, now)).toBe(
      (await referenceMembers(filter)).length,
    );
  });

  it('with match any, requires at least one condition', async () => {
    const filter = filterOf([countryIsDeu, purchasedWithin30Days], 'any');
    expect(await countAudienceMembers(db, filter, now)).toBe(
      (await referenceMembers(filter)).length,
    );
  });

  it('counts customers with no events at all for not_performed', async () => {
    const withEvents = new Set(allEvents.map((event) => event.customerId));
    const neverActive = allCustomers.filter((customer) => !withEvents.has(customer.id));
    expect(neverActive.length).toBeGreaterThan(0);

    const filter = filterOf([noPurchaseWithin3Months]);
    const ids = new Set(await allMemberIds(filter, 100));
    expect(neverActive.every((customer) => ids.has(customer.id))).toBe(true);
  });

  it('treats a filter value as data, not SQL', async () => {
    const filter = filterOf([
      { kind: 'attribute', field: 'country', operator: 'is', value: "DEU' or '1'='1" },
    ]);
    expect(await countAudienceMembers(db, filter, now)).toBe(0);
    expect(await db.$count(customers)).toBe(allCustomers.length);
  });
});

describe('listAudienceMembers', () => {
  it('pages through every member in id order, with no repeats or gaps', async () => {
    const filter = filterOf([
      { kind: 'attribute', field: 'country', operator: 'is', value: 'SWE' },
    ]);
    const expected = await referenceMembers(filter);
    expect(expected.length).toBeGreaterThan(100);
    expect(await allMemberIds(filter, 100)).toEqual(expected);
  });

  it('says there is no next page on the last page', async () => {
    const filter = filterOf([countryIsDeu]);
    const expected = await referenceMembers(filter);
    const last = expected.at(-2);
    const page = await listAudienceMembers(db, filter, { first: 5, after: last }, now);
    expect(page.members.map((member) => member.id)).toEqual(expected.slice(-1));
    expect(page.hasNextPage).toBe(false);
  });

  it('returns an empty page after the last member', async () => {
    const filter = filterOf([countryIsDeu]);
    const last = (await referenceMembers(filter)).at(-1);
    const page = await listAudienceMembers(db, filter, { first: 5, after: last }, now);
    expect(page).toEqual({ members: [], hasNextPage: false });
  });
});
