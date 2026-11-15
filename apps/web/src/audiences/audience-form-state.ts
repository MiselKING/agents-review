import {
  MAX_AUDIENCE_NAME_LENGTH,
  MAX_FILTER_CONDITIONS,
  MAX_WINDOW_AMOUNT,
} from '@agents-review/shared/audience-filter';
import { EVENT_TYPES } from '@agents-review/shared/events';

import type { AudienceFilterInput, AudienceQuery, FilterMatch, WindowUnit } from '../gql/graphql';

export { MAX_FILTER_CONDITIONS };

/** A time window as typed: the amount stays text until it is valid. */
export interface WindowFormState {
  amount: string;
  unit: WindowUnit;
}

export type ConditionFormState =
  | { id: string; kind: 'country'; operator: 'IS' | 'IS_NOT'; country: string | null }
  | {
      id: string;
      kind: 'signedUp';
      operator: 'WITHIN_LAST' | 'MORE_THAN_AGO';
      window: WindowFormState;
    }
  | {
      id: string;
      kind: 'event';
      operator: 'PERFORMED' | 'NOT_PERFORMED';
      eventType: string;
      window: WindowFormState;
    };

export type ConditionKind = ConditionFormState['kind'];

/** The builder's form state, which may be incomplete or invalid. */
export interface AudienceFormState {
  name: string;
  match: FilterMatch;
  conditions: ConditionFormState[];
}

export interface ConditionErrors {
  country?: string;
  amount?: string;
  eventType?: string;
}

export interface FormErrors {
  name?: string;
  conditions: Record<string, ConditionErrors>;
}

export const CONDITION_KINDS: readonly { value: ConditionKind; label: string }[] = [
  { value: 'country', label: 'Country' },
  { value: 'signedUp', label: 'Signed up' },
  { value: 'event', label: 'Event' },
];

export const OPERATORS = {
  country: [
    { value: 'IS', label: 'is' },
    { value: 'IS_NOT', label: 'is not' },
  ],
  signedUp: [
    { value: 'WITHIN_LAST', label: 'within the last' },
    { value: 'MORE_THAN_AGO', label: 'more than' },
  ],
  event: [
    { value: 'PERFORMED', label: 'did' },
    { value: 'NOT_PERFORMED', label: 'did not' },
  ],
} as const;

export const WINDOW_UNITS: readonly { value: WindowUnit; label: string }[] = [
  { value: 'DAY', label: 'days' },
  { value: 'WEEK', label: 'weeks' },
  { value: 'MONTH', label: 'months' },
];

/** "page_view" → "Page view". */
export const eventTypeLabel = (eventType: string) => {
  const words = eventType.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const DEFAULT_WINDOW: WindowFormState = { amount: '30', unit: 'DAY' };

export function newCondition(
  kind: ConditionKind,
  id: string = crypto.randomUUID(),
): ConditionFormState {
  if (kind === 'country') return { id, kind, operator: 'IS', country: null };
  if (kind === 'signedUp') return { id, kind, operator: 'WITHIN_LAST', window: DEFAULT_WINDOW };
  return { id, kind, operator: 'PERFORMED', eventType: EVENT_TYPES[0], window: DEFAULT_WINDOW };
}

export const emptyFormState = (): AudienceFormState => ({
  name: '',
  match: 'ALL',
  conditions: [newCondition('country')],
});

type SavedAudience = NonNullable<AudienceQuery['audience']>;
type SavedCondition = SavedAudience['definition']['conditions'][number];

function conditionFromSaved(condition: SavedCondition): ConditionFormState {
  const id = crypto.randomUUID();
  if (condition.__typename === 'AttributeCondition') {
    const operator = condition.operator === 'IS_NOT' ? 'IS_NOT' : 'IS';
    return { id, kind: 'country', operator, country: condition.value };
  }
  const window = { amount: String(condition.window.amount), unit: condition.window.unit };
  if (condition.__typename === 'SignedUpCondition') {
    const operator = condition.operator === 'MORE_THAN_AGO' ? 'MORE_THAN_AGO' : 'WITHIN_LAST';
    return { id, kind: 'signedUp', operator, window };
  }
  const operator = condition.operator === 'NOT_PERFORMED' ? 'NOT_PERFORMED' : 'PERFORMED';
  return { id, kind: 'event', operator, eventType: condition.eventType, window };
}

export const formStateFromAudience = (audience: SavedAudience): AudienceFormState => ({
  name: audience.name,
  match: audience.definition.match,
  conditions: audience.definition.conditions.map(conditionFromSaved),
});

function parseAmount(amount: string): number | undefined {
  if (!/^\d+$/.test(amount.trim())) return undefined;
  const value = Number(amount);
  return value >= 1 && value <= MAX_WINDOW_AMOUNT ? value : undefined;
}

function conditionErrors(condition: ConditionFormState): ConditionErrors {
  const errors: ConditionErrors = {};
  if (condition.kind === 'country' && condition.country === null) {
    errors.country = 'Choose a country.';
  }
  if (condition.kind !== 'country' && parseAmount(condition.window.amount) === undefined) {
    errors.amount = `Enter a whole number from 1 to ${MAX_WINDOW_AMOUNT}.`;
  }
  if (
    condition.kind === 'event' &&
    !(EVENT_TYPES as readonly string[]).includes(condition.eventType)
  ) {
    errors.eventType = 'Choose an event.';
  }
  return errors;
}

/** The problems to show next to each field. Mirrors the API's rules; the API stays the authority. */
export function validateFormState(state: AudienceFormState): FormErrors {
  const name = state.name.trim();
  const errors: FormErrors = { conditions: {} };
  if (name.length === 0) errors.name = 'Enter a name.';
  else if (name.length > MAX_AUDIENCE_NAME_LENGTH) {
    errors.name = `Use ${MAX_AUDIENCE_NAME_LENGTH} characters or fewer.`;
  }
  for (const condition of state.conditions) {
    const found = conditionErrors(condition);
    if (Object.keys(found).length > 0) errors.conditions[condition.id] = found;
  }
  return errors;
}

export const hasErrors = (errors: FormErrors) =>
  errors.name !== undefined || Object.keys(errors.conditions).length > 0;

const windowInput = (window: WindowFormState) => {
  const amount = parseAmount(window.amount);
  return amount === undefined ? undefined : { amount, unit: window.unit };
};

/** The filter to send to the API, or null while any condition is incomplete or invalid. */
export function filterInputFromFormState(state: AudienceFormState): AudienceFilterInput | null {
  const conditions: AudienceFilterInput['conditions'] = [];
  for (const condition of state.conditions) {
    if (Object.keys(conditionErrors(condition)).length > 0) return null;
    if (condition.kind === 'country') {
      if (condition.country === null) return null;
      conditions.push({
        attribute: { field: 'COUNTRY', operator: condition.operator, value: condition.country },
      });
      continue;
    }
    const window = windowInput(condition.window);
    if (!window) return null;
    conditions.push(
      condition.kind === 'signedUp'
        ? { signedUp: { operator: condition.operator, window } }
        : { event: { eventType: condition.eventType, operator: condition.operator, window } },
    );
  }
  return conditions.length > 0 ? { version: 1, match: state.match, conditions } : null;
}
