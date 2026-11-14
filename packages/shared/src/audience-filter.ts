import { EVENT_TYPES, type EventType, isEventType } from './events.ts';

export const AUDIENCE_FILTER_VERSION = 1;
export const MAX_FILTER_CONDITIONS = 20;
export const MAX_WINDOW_AMOUNT = 1000;
export const MAX_AUDIENCE_NAME_LENGTH = 100;

export const FILTER_MATCHES = ['all', 'any'] as const;
export const WINDOW_UNITS = ['day', 'week', 'month'] as const;
export const ATTRIBUTE_FIELDS = ['country'] as const;
export const ATTRIBUTE_OPERATORS = ['is', 'is_not'] as const;
export const SIGNED_UP_OPERATORS = ['within_last', 'more_than_ago'] as const;
export const EVENT_OPERATORS = ['performed', 'not_performed'] as const;

export type FilterMatch = (typeof FILTER_MATCHES)[number];
export type WindowUnit = (typeof WINDOW_UNITS)[number];
export type AttributeField = (typeof ATTRIBUTE_FIELDS)[number];
export type AttributeOperator = (typeof ATTRIBUTE_OPERATORS)[number];
export type SignedUpOperator = (typeof SIGNED_UP_OPERATORS)[number];
export type EventOperator = (typeof EVENT_OPERATORS)[number];

export interface TimeWindow {
  amount: number;
  unit: WindowUnit;
}

export interface AttributeCondition {
  kind: 'attribute';
  field: AttributeField;
  operator: AttributeOperator;
  value: string;
}

/** Compares the customer's `created_at`. */
export interface SignedUpCondition {
  kind: 'signed_up';
  operator: SignedUpOperator;
  window: TimeWindow;
}

/** `not_performed` also matches customers with no events at all. */
export interface EventCondition {
  kind: 'event';
  eventType: EventType;
  operator: EventOperator;
  window: TimeWindow;
}

export type FilterCondition = AttributeCondition | SignedUpCondition | EventCondition;

/** What `audiences.definition` stores. */
export interface AudienceFilter {
  version: typeof AUDIENCE_FILTER_VERSION;
  match: FilterMatch;
  conditions: FilterCondition[];
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

type Field = { value: unknown; path: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fieldOf = (parent: Record<string, unknown>, key: string, path: string): Field => ({
  value: parent[key],
  path: `${path}.${key}`,
});

function oneOf<T extends string>(
  { value, path }: Field,
  allowed: readonly T[],
  errors: string[],
): T | undefined {
  const match = allowed.find((option) => option === value);
  if (match === undefined) {
    errors.push(`${path} must be one of: ${allowed.join(', ')}. Got ${JSON.stringify(value)}.`);
  }
  return match;
}

function parseWindow(field: Field, errors: string[]): TimeWindow | undefined {
  if (!isRecord(field.value)) {
    errors.push(`${field.path} must be an object with amount and unit.`);
    return undefined;
  }
  const amountField = fieldOf(field.value, 'amount', field.path);
  const amount = amountField.value;
  const validAmount =
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount >= 1 &&
    amount <= MAX_WINDOW_AMOUNT;
  if (!validAmount) {
    errors.push(`${amountField.path} must be a whole number from 1 to ${MAX_WINDOW_AMOUNT}.`);
  }
  const unit = oneOf(fieldOf(field.value, 'unit', field.path), WINDOW_UNITS, errors);
  return validAmount && unit ? { amount, unit } : undefined;
}

function parseCondition(raw: unknown, path: string, errors: string[]): FilterCondition | undefined {
  if (!isRecord(raw)) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }
  const kind = oneOf(
    fieldOf(raw, 'kind', path),
    ['attribute', 'signed_up', 'event'] as const,
    errors,
  );
  const before = errors.length;

  if (kind === 'attribute') {
    const field = oneOf(fieldOf(raw, 'field', path), ATTRIBUTE_FIELDS, errors);
    const operator = oneOf(fieldOf(raw, 'operator', path), ATTRIBUTE_OPERATORS, errors);
    const valueField = fieldOf(raw, 'value', path);
    const value = valueField.value;
    if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
      errors.push(`${valueField.path} must be a country code of 3 uppercase letters, like DEU.`);
    }
    if (errors.length > before || !field || !operator || typeof value !== 'string')
      return undefined;
    const condition: AttributeCondition = { kind, field, operator, value };
    return condition;
  }

  if (kind === 'signed_up') {
    const operator = oneOf(fieldOf(raw, 'operator', path), SIGNED_UP_OPERATORS, errors);
    const window = parseWindow(fieldOf(raw, 'window', path), errors);
    if (errors.length > before || !operator || !window) return undefined;
    const condition: SignedUpCondition = { kind, operator, window };
    return condition;
  }

  if (kind === 'event') {
    const eventTypeField = fieldOf(raw, 'eventType', path);
    const eventType = eventTypeField.value;
    if (typeof eventType !== 'string' || !isEventType(eventType)) {
      errors.push(
        `${eventTypeField.path} must be one of: ${EVENT_TYPES.join(', ')}. Got ${JSON.stringify(eventType)}.`,
      );
    }
    const operator = oneOf(fieldOf(raw, 'operator', path), EVENT_OPERATORS, errors);
    const window = parseWindow(fieldOf(raw, 'window', path), errors);
    if (errors.length > before || typeof eventType !== 'string' || !isEventType(eventType))
      return undefined;
    if (!operator || !window) return undefined;
    const condition: EventCondition = { kind, eventType, operator, window };
    return condition;
  }
  return undefined;
}

/**
 * Checks any value against the filter format and returns a clean copy (unknown keys dropped),
 * or every problem found, each naming the path of the bad value.
 */
export function parseAudienceFilter(raw: unknown): ParseResult<AudienceFilter> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['definition must be an object.'] };

  const version = fieldOf(raw, 'version', 'definition').value;
  if (version !== AUDIENCE_FILTER_VERSION) {
    errors.push(
      `definition.version ${JSON.stringify(version)} is not supported. Supported: ${AUDIENCE_FILTER_VERSION}.`,
    );
  }
  const match = oneOf(fieldOf(raw, 'match', 'definition'), FILTER_MATCHES, errors);

  const rawConditions = fieldOf(raw, 'conditions', 'definition').value;
  const conditions: FilterCondition[] = [];
  if (!Array.isArray(rawConditions)) {
    errors.push('definition.conditions must be a list.');
  } else if (rawConditions.length < 1 || rawConditions.length > MAX_FILTER_CONDITIONS) {
    errors.push(
      `definition.conditions must have 1 to ${MAX_FILTER_CONDITIONS} conditions, got ${rawConditions.length}.`,
    );
  } else {
    for (const [index, item] of rawConditions.entries()) {
      const condition = parseCondition(item, `definition.conditions[${index}]`, errors);
      if (condition) conditions.push(condition);
    }
  }

  if (errors.length > 0 || !match) return { ok: false, errors };
  return { ok: true, value: { version: AUDIENCE_FILTER_VERSION, match, conditions } };
}

/** Trims the name and checks its length. */
export function parseAudienceName(raw: string): ParseResult<string> {
  const name = raw.trim();
  if (name.length < 1 || name.length > MAX_AUDIENCE_NAME_LENGTH) {
    return {
      ok: false,
      errors: [`name must be 1 to ${MAX_AUDIENCE_NAME_LENGTH} characters after trimming.`],
    };
  }
  return { ok: true, value: name };
}
