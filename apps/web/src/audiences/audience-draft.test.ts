import { describe, expect, it } from 'vitest';

import {
  type AudienceDraft,
  draftFromAudience,
  emptyDraft,
  filterInputFromDraft,
  hasErrors,
  newCondition,
  validateDraft,
} from './audience-draft';

const complete: AudienceDraft = {
  name: '  Buyers  ',
  match: 'ANY',
  conditions: [
    { id: 'a', kind: 'country', operator: 'IS_NOT', country: 'DEU' },
    {
      id: 'b',
      kind: 'signedUp',
      operator: 'MORE_THAN_AGO',
      window: { amount: '6', unit: 'MONTH' },
    },
    {
      id: 'c',
      kind: 'event',
      operator: 'PERFORMED',
      eventType: 'page_view',
      window: { amount: '2', unit: 'WEEK' },
    },
  ],
};

describe('filterInputFromDraft', () => {
  it("builds the API's filter input from a complete draft", () => {
    expect(filterInputFromDraft(complete)).toEqual({
      version: 1,
      match: 'ANY',
      conditions: [
        { attribute: { field: 'COUNTRY', operator: 'IS_NOT', value: 'DEU' } },
        { signedUp: { operator: 'MORE_THAN_AGO', window: { amount: 6, unit: 'MONTH' } } },
        {
          event: {
            eventType: 'page_view',
            operator: 'PERFORMED',
            window: { amount: 2, unit: 'WEEK' },
          },
        },
      ],
    });
  });

  it('returns null while a condition is incomplete or invalid', () => {
    expect(filterInputFromDraft(emptyDraft())).toBeNull();
    for (const amount of ['', '0', '1001', '2.5', 'abc']) {
      const draft: AudienceDraft = {
        ...complete,
        conditions: [
          { id: 'x', kind: 'signedUp', operator: 'WITHIN_LAST', window: { amount, unit: 'DAY' } },
        ],
      };
      expect(filterInputFromDraft(draft)).toBeNull();
    }
  });
});

describe('validateDraft', () => {
  it('finds no problems in a complete draft', () => {
    expect(hasErrors(validateDraft(complete))).toBe(false);
  });

  it('names each problem by field', () => {
    const errors = validateDraft({
      name: '   ',
      match: 'ALL',
      conditions: [
        { id: 'a', kind: 'country', operator: 'IS', country: null },
        {
          id: 'b',
          kind: 'signedUp',
          operator: 'WITHIN_LAST',
          window: { amount: '0', unit: 'DAY' },
        },
        {
          id: 'c',
          kind: 'event',
          operator: 'PERFORMED',
          eventType: 'refund',
          window: { amount: '1', unit: 'DAY' },
        },
      ],
    });
    expect(errors).toEqual({
      name: 'Enter a name.',
      conditions: {
        a: { country: 'Choose a country.' },
        b: { amount: 'Enter a whole number from 1 to 1000.' },
        c: { eventType: 'Choose an event.' },
      },
    });
  });

  it('rejects a name longer than 100 characters', () => {
    expect(validateDraft({ ...complete, name: 'x'.repeat(101) }).name).toMatch(/100 characters/);
  });
});

describe('newCondition', () => {
  it('keeps the id when a condition changes kind', () => {
    expect(newCondition('event', 'same')).toMatchObject({
      id: 'same',
      kind: 'event',
      eventType: 'purchase',
    });
  });
});

describe('draftFromAudience', () => {
  it('turns a saved audience back into the same filter', () => {
    const draft = draftFromAudience({
      id: '1',
      name: 'Buyers',
      definition: {
        version: 1,
        match: 'ANY',
        conditions: [
          { __typename: 'AttributeCondition', field: 'COUNTRY', operator: 'IS_NOT', value: 'DEU' },
          {
            __typename: 'SignedUpCondition',
            operator: 'MORE_THAN_AGO',
            window: { amount: 6, unit: 'MONTH' },
          },
          {
            __typename: 'EventCondition',
            eventType: 'page_view',
            operator: 'PERFORMED',
            window: { amount: 2, unit: 'WEEK' },
          },
        ],
      },
    });
    expect(draft.name).toBe('Buyers');
    expect(filterInputFromDraft(draft)).toEqual(filterInputFromDraft(complete));
  });
});
