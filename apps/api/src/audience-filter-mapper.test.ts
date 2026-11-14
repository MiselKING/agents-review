import { describe, expect, it } from 'vitest';

import { filterFromInput, filterToOutput } from './audience-filter-mapper.ts';
import type { AudienceFilterInput } from './generated/graphql.ts';

const input: AudienceFilterInput = {
  version: 1,
  match: 'ANY',
  conditions: [
    { attribute: { field: 'COUNTRY', operator: 'IS_NOT', value: 'FRA' } },
    { signedUp: { operator: 'MORE_THAN_AGO', window: { amount: 6, unit: 'MONTH' } } },
    {
      event: { eventType: 'page_view', operator: 'PERFORMED', window: { amount: 2, unit: 'WEEK' } },
    },
  ],
};

const stored = {
  version: 1,
  match: 'any',
  conditions: [
    { kind: 'attribute', field: 'country', operator: 'is_not', value: 'FRA' },
    { kind: 'signed_up', operator: 'more_than_ago', window: { amount: 6, unit: 'month' } },
    {
      kind: 'event',
      eventType: 'page_view',
      operator: 'performed',
      window: { amount: 2, unit: 'week' },
    },
  ],
};

describe('filterFromInput', () => {
  it('converts every condition kind to the stored shape', () => {
    expect(filterFromInput(input)).toEqual({ ok: true, value: stored });
  });

  it('returns the validation errors for an invalid filter', () => {
    const result = filterFromInput({ ...input, version: 2, conditions: [] });
    expect(result.ok).toBe(false);
  });
});

describe('filterToOutput', () => {
  it('converts back to the GraphQL shape, tagging each condition type', () => {
    const result = filterFromInput(input);
    if (!result.ok) throw new Error(result.errors.join(' '));
    expect(filterToOutput(result.value)).toEqual({
      version: 1,
      match: 'ANY',
      conditions: [
        { __typename: 'AttributeCondition', ...input.conditions[0]?.attribute },
        { __typename: 'SignedUpCondition', ...input.conditions[1]?.signedUp },
        { __typename: 'EventCondition', ...input.conditions[2]?.event },
      ],
    });
  });
});
