import { EVENT_TYPES } from '@agents-review/shared/events';

import type { WindowUnit } from '../gql/graphql';
import { Button } from '../ui/Button';
import {
  CONDITION_KINDS,
  type ConditionFormState,
  type ConditionErrors,
  type ConditionKind,
  eventTypeLabel,
  newCondition,
  OPERATORS,
  WINDOW_UNITS,
  type WindowFormState,
} from './audience-form-state';
import { CountryCombobox } from './CountryCombobox';

const controlClasses =
  'h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 aria-invalid:border-red-500';

interface ConditionRowProps {
  condition: ConditionFormState;
  position: number;
  errors: ConditionErrors;
  canRemove: boolean;
  onChange: (condition: ConditionFormState) => void;
  onRemove: () => void;
  onTouch: (field: 'country' | 'amount') => void;
}

function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const option = options.find((item) => item.value === event.target.value);
          if (option) onChange(option.value);
        }}
        className={controlClasses}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}

function WindowFields({
  idPrefix,
  labelPrefix,
  window,
  error,
  onChange,
  onTouch,
}: {
  idPrefix: string;
  labelPrefix: string;
  window: WindowFormState;
  error: string | undefined;
  onChange: (window: WindowFormState) => void;
  onTouch: () => void;
}) {
  return (
    <>
      <label htmlFor={`${idPrefix}-amount`} className="sr-only">
        {`${labelPrefix} amount`}
      </label>
      <input
        id={`${idPrefix}-amount`}
        inputMode="numeric"
        value={window.amount}
        onChange={(event) => onChange({ ...window, amount: event.target.value })}
        onBlur={onTouch}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${idPrefix}-amount-error` : undefined}
        className={`${controlClasses} w-20`}
      />
      <Select<WindowUnit>
        id={`${idPrefix}-unit`}
        label={`${labelPrefix} unit`}
        value={window.unit}
        options={WINDOW_UNITS}
        onChange={(unit) => onChange({ ...window, unit })}
      />
    </>
  );
}

export function ConditionRow({
  condition,
  position,
  errors,
  canRemove,
  onChange,
  onRemove,
  onTouch,
}: ConditionRowProps) {
  const idPrefix = `condition-${condition.id}`;
  const labelPrefix = `Condition ${position}`;
  const shownErrors = [
    errors.country && { id: `${idPrefix}-country-error`, text: errors.country },
    errors.amount && { id: `${idPrefix}-amount-error`, text: errors.amount },
    errors.eventType && { id: `${idPrefix}-event-error`, text: errors.eventType },
  ].filter((error) => typeof error === 'object');

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <fieldset>
        <legend className="sr-only">{labelPrefix}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <Select<ConditionKind>
            id={`${idPrefix}-kind`}
            label={`${labelPrefix} type`}
            value={condition.kind}
            options={CONDITION_KINDS}
            onChange={(kind) => {
              if (kind !== condition.kind) onChange(newCondition(kind, condition.id));
            }}
          />

          {condition.kind === 'country' ? (
            <>
              <Select
                id={`${idPrefix}-operator`}
                label={`${labelPrefix} operator`}
                value={condition.operator}
                options={OPERATORS.country}
                onChange={(operator) => onChange({ ...condition, operator })}
              />
              <CountryCombobox
                id={`${idPrefix}-country`}
                label={`${labelPrefix} country`}
                value={condition.country}
                onChange={(country) => onChange({ ...condition, country })}
                onBlur={() => onTouch('country')}
                invalid={errors.country !== undefined}
                describedBy={errors.country ? `${idPrefix}-country-error` : undefined}
              />
            </>
          ) : null}

          {condition.kind === 'signedUp' ? (
            <>
              <Select
                id={`${idPrefix}-operator`}
                label={`${labelPrefix} operator`}
                value={condition.operator}
                options={OPERATORS.signedUp}
                onChange={(operator) => onChange({ ...condition, operator })}
              />
              <WindowFields
                idPrefix={idPrefix}
                labelPrefix={labelPrefix}
                window={condition.window}
                error={errors.amount}
                onChange={(window) => onChange({ ...condition, window })}
                onTouch={() => onTouch('amount')}
              />
              {condition.operator === 'MORE_THAN_AGO' ? (
                <span className="text-sm text-slate-600">ago</span>
              ) : null}
            </>
          ) : null}

          {condition.kind === 'event' ? (
            <>
              <Select
                id={`${idPrefix}-operator`}
                label={`${labelPrefix} operator`}
                value={condition.operator}
                options={OPERATORS.event}
                onChange={(operator) => onChange({ ...condition, operator })}
              />
              <Select
                id={`${idPrefix}-event`}
                label={`${labelPrefix} event`}
                value={condition.eventType}
                options={EVENT_TYPES.map((eventType) => ({
                  value: eventType,
                  label: eventTypeLabel(eventType),
                }))}
                onChange={(eventType) => onChange({ ...condition, eventType })}
              />
              <span className="text-sm text-slate-600">in the last</span>
              <WindowFields
                idPrefix={idPrefix}
                labelPrefix={labelPrefix}
                window={condition.window}
                error={errors.amount}
                onChange={(window) => onChange({ ...condition, window })}
                onTouch={() => onTouch('amount')}
              />
            </>
          ) : null}

          <Button
            variant="ghost"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label={`Remove condition ${position}`}
            className="ml-auto"
          >
            Remove
          </Button>
        </div>

        {shownErrors.map((error) => (
          <p key={error.id} id={error.id} className="mt-2 text-sm text-red-600">
            {error.text}
          </p>
        ))}
      </fieldset>
    </li>
  );
}
