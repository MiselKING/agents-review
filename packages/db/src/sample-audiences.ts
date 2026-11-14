import type { AudienceFilter } from '@agents-review/shared/audiences';

import type { Queryable } from './client.ts';
import { audiences } from './schema.ts';

export const SAMPLE_AUDIENCES: readonly { name: string; definition: AudienceFilter }[] = [
  {
    name: 'Recent buyers in Germany',
    definition: {
      version: 1,
      match: 'all',
      conditions: [
        { kind: 'attribute', field: 'country', operator: 'is', value: 'DEU' },
        {
          kind: 'event',
          eventType: 'purchase',
          operator: 'performed',
          window: { amount: 30, unit: 'day' },
        },
      ],
    },
  },
  {
    name: 'Browsing but not buying',
    definition: {
      version: 1,
      match: 'all',
      conditions: [
        {
          kind: 'event',
          eventType: 'page_view',
          operator: 'performed',
          window: { amount: 2, unit: 'week' },
        },
        {
          kind: 'event',
          eventType: 'purchase',
          operator: 'not_performed',
          window: { amount: 3, unit: 'month' },
        },
      ],
    },
  },
  {
    name: 'New or North American customers',
    definition: {
      version: 1,
      match: 'any',
      conditions: [
        { kind: 'signed_up', operator: 'within_last', window: { amount: 12, unit: 'month' } },
        { kind: 'attribute', field: 'country', operator: 'is', value: 'USA' },
        { kind: 'attribute', field: 'country', operator: 'is', value: 'CAN' },
      ],
    },
  },
];

/** Adds the sample audiences only when there are none, so audiences made by hand are never touched. */
export async function seedSampleAudiences(db: Queryable): Promise<number> {
  if ((await db.$count(audiences)) > 0) return 0;
  await db.insert(audiences).values([...SAMPLE_AUDIENCES]);
  return SAMPLE_AUDIENCES.length;
}
