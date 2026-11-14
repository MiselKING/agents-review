import { describe, expect, it } from 'vitest';

import { parseAudienceFilter, parseAudienceName } from './audiences.ts';

const valid = {
  version: 1,
  match: 'all',
  conditions: [
    { kind: 'attribute', field: 'country', operator: 'is', value: 'DEU' },
    { kind: 'signed_up', operator: 'more_than_ago', window: { amount: 6, unit: 'month' } },
    {
      kind: 'event',
      eventType: 'purchase',
      operator: 'not_performed',
      window: { amount: 2, unit: 'week' },
    },
  ],
};

function errorsFor(raw: unknown): string[] {
  const result = parseAudienceFilter(raw);
  return result.ok ? [] : result.errors;
}

const withCondition = (condition: unknown) => ({ ...valid, conditions: [condition] });

describe('parseAudienceFilter', () => {
  it('accepts every condition kind and returns an equal filter', () => {
    expect(parseAudienceFilter(valid)).toEqual({ ok: true, value: valid });
  });

  it('drops keys the format does not know', () => {
    const result = parseAudienceFilter({
      ...valid,
      extra: true,
      conditions: [{ ...valid.conditions[0], extra: 'x' }],
    });
    expect(result).toEqual({ ok: true, value: { ...valid, conditions: [valid.conditions[0]] } });
  });

  it.each([
    ['a non-object', 'nope', /definition must be an object/],
    ['an unsupported version', { ...valid, version: 2 }, /version 2 is not supported/],
    ['an unknown match', { ...valid, match: 'some' }, /definition\.match must be one of: all, any/],
    ['no conditions', { ...valid, conditions: [] }, /1 to 20 conditions, got 0/],
    [
      'more than 20 conditions',
      { ...valid, conditions: Array.from({ length: 21 }, () => valid.conditions[0]) },
      /1 to 20 conditions, got 21/,
    ],
    ['an unknown kind', withCondition({ kind: 'tag' }), /conditions\[0\]\.kind must be one of/],
    [
      'an unknown field',
      withCondition({ kind: 'attribute', field: 'city', operator: 'is', value: 'DEU' }),
      /conditions\[0\]\.field must be one of: country/,
    ],
    [
      'an unknown operator',
      withCondition({ kind: 'attribute', field: 'country', operator: 'like', value: 'DEU' }),
      /conditions\[0\]\.operator must be one of: is, is_not/,
    ],
    [
      'a lowercase country',
      withCondition({ kind: 'attribute', field: 'country', operator: 'is', value: 'deu' }),
      /3 uppercase letters/,
    ],
    [
      'an unknown event type',
      withCondition({
        kind: 'event',
        eventType: 'refund',
        operator: 'performed',
        window: { amount: 1, unit: 'day' },
      }),
      /eventType must be one of: purchase, page_view\. Got "refund"/,
    ],
    [
      'an unknown unit',
      withCondition({
        kind: 'signed_up',
        operator: 'within_last',
        window: { amount: 1, unit: 'hour' },
      }),
      /window\.unit must be one of: day, week, month/,
    ],
    [
      'an amount below 1',
      withCondition({
        kind: 'signed_up',
        operator: 'within_last',
        window: { amount: 0, unit: 'day' },
      }),
      /window\.amount must be a whole number from 1 to 1000/,
    ],
    [
      'an amount above 1000',
      withCondition({
        kind: 'signed_up',
        operator: 'within_last',
        window: { amount: 1001, unit: 'day' },
      }),
      /window\.amount/,
    ],
    [
      'a fractional amount',
      withCondition({
        kind: 'signed_up',
        operator: 'within_last',
        window: { amount: 1.5, unit: 'day' },
      }),
      /window\.amount/,
    ],
    [
      'a missing window',
      withCondition({ kind: 'signed_up', operator: 'within_last' }),
      /window must be an object/,
    ],
  ])('rejects %s', (_name, raw, message) => {
    const errors = errorsFor(raw);
    expect(errors.some((error) => message.test(error))).toBe(true);
  });

  it('reports every problem at once', () => {
    expect(errorsFor({ version: 2, match: 'some', conditions: [] })).toHaveLength(3);
  });
});

describe('parseAudienceName', () => {
  it('trims the name', () => {
    expect(parseAudienceName('  Buyers  ')).toEqual({ ok: true, value: 'Buyers' });
  });

  it('rejects an empty or too long name', () => {
    expect(parseAudienceName('   ').ok).toBe(false);
    expect(parseAudienceName('x'.repeat(101)).ok).toBe(false);
    expect(parseAudienceName('x'.repeat(100)).ok).toBe(true);
  });
});
