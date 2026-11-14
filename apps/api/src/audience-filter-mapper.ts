import {
  type AttributeOperator,
  type AudienceFilter,
  type EventOperator,
  type FilterCondition,
  type FilterMatch,
  type ParseResult,
  parseAudienceFilter,
  type SignedUpOperator,
  type TimeWindow,
  type WindowUnit,
} from '@agents-review/shared/audience-filter';

import type {
  AudienceFilter as GqlAudienceFilter,
  AudienceFilterInput,
  ConditionOperator,
  FilterCondition as GqlFilterCondition,
  FilterConditionInput,
  TimeWindowInput,
} from './generated/graphql.ts';

// GraphQL enums are UPPER_CASE; the stored filter uses the same names in lower case.
const MATCHES: Record<FilterMatch, GqlAudienceFilter['match']> = { all: 'ALL', any: 'ANY' };
const UNITS: Record<WindowUnit, TimeWindowInput['unit']> = {
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
};
const OPERATORS: Record<AttributeOperator | SignedUpOperator | EventOperator, ConditionOperator> = {
  is: 'IS',
  is_not: 'IS_NOT',
  within_last: 'WITHIN_LAST',
  more_than_ago: 'MORE_THAN_AGO',
  performed: 'PERFORMED',
  not_performed: 'NOT_PERFORMED',
};

const lower = (value: string) => value.toLowerCase();

const windowFromInput = (window: TimeWindowInput) => ({
  amount: window.amount,
  unit: lower(window.unit),
});

function conditionFromInput(input: FilterConditionInput) {
  if (input.attribute) {
    const { field, operator, value } = input.attribute;
    return { kind: 'attribute', field: lower(field), operator: lower(operator), value };
  }
  if (input.signedUp) {
    const { operator, window } = input.signedUp;
    return { kind: 'signed_up', operator: lower(operator), window: windowFromInput(window) };
  }
  const { eventType, operator, window } = input.event;
  return { kind: 'event', eventType, operator: lower(operator), window: windowFromInput(window) };
}

/** Converts the GraphQL input to the stored shape, then validates it. */
export function filterFromInput(input: AudienceFilterInput): ParseResult<AudienceFilter> {
  return parseAudienceFilter({
    version: input.version,
    match: lower(input.match),
    conditions: input.conditions.map(conditionFromInput),
  });
}

const windowToOutput = (window: TimeWindow) => ({
  amount: window.amount,
  unit: UNITS[window.unit],
});

function conditionToOutput(condition: FilterCondition): GqlFilterCondition {
  if (condition.kind === 'attribute') {
    return {
      __typename: 'AttributeCondition',
      field: 'COUNTRY',
      operator: OPERATORS[condition.operator],
      value: condition.value,
    };
  }
  if (condition.kind === 'signed_up') {
    return {
      __typename: 'SignedUpCondition',
      operator: OPERATORS[condition.operator],
      window: windowToOutput(condition.window),
    };
  }
  return {
    __typename: 'EventCondition',
    eventType: condition.eventType,
    operator: OPERATORS[condition.operator],
    window: windowToOutput(condition.window),
  };
}

/** Converts a stored filter to the GraphQL output shape. */
export function filterToOutput(filter: AudienceFilter): GqlAudienceFilter {
  return {
    version: filter.version,
    match: MATCHES[filter.match],
    conditions: filter.conditions.map(conditionToOutput),
  };
}
