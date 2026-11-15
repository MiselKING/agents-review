import { useEffect, useRef, useState } from 'react';

import type { FilterMatch } from '../gql/graphql';
import { Button, ButtonLink } from '../ui/Button';
import type { AudienceValues } from './api';
import {
  type AudienceFormState,
  type ConditionFormState,
  filterInputFromFormState,
  hasErrors,
  MAX_FILTER_CONDITIONS,
  newCondition,
  validateFormState,
} from './audience-form-state';
import { ConditionRow } from './ConditionRow';
import { MemberCountPreview } from './MemberCountPreview';

interface AudienceFormProps {
  initial: AudienceFormState;
  submitLabel: string;
  isSaving: boolean;
  saveError: Error | null;
  onSave: (values: AudienceValues) => void;
}

const MATCH_OPTIONS: readonly { value: FilterMatch; label: string }[] = [
  { value: 'ALL', label: 'All conditions' },
  { value: 'ANY', label: 'Any condition' },
];

export function AudienceForm({
  initial,
  submitLabel,
  isSaving,
  saveError,
  onSave,
}: AudienceFormProps) {
  const [state, setState] = useState(initial);
  // Errors show once a field was left, or for every field after a save attempt.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [saveAttempts, setSaveAttempts] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = validateFormState(state);
  const filter = filterInputFromFormState(state);
  const isShown = (key: string) => saveAttempts > 0 || touched.has(key);
  const touch = (key: string) => setTouched((current) => new Set(current).add(key));

  useEffect(() => {
    if (saveAttempts > 0)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [saveAttempts]);

  const updateCondition = (updated: ConditionFormState) =>
    setState((current) => ({
      ...current,
      conditions: current.conditions.map((condition) =>
        condition.id === updated.id ? updated : condition,
      ),
    }));

  const removeCondition = (id: string) =>
    setState((current) => ({
      ...current,
      conditions: current.conditions.filter((condition) => condition.id !== id),
    }));

  const addCondition = () =>
    setState((current) => ({
      ...current,
      conditions: [...current.conditions, newCondition('country')],
    }));

  const nameError = isShown('name') ? errors.name : undefined;
  const canAdd = state.conditions.length < MAX_FILTER_CONDITIONS;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (hasErrors(errors) || !filter) {
          setSaveAttempts((count) => count + 1);
          return;
        }
        onSave({ name: state.name.trim(), definition: filter });
      }}
      className="space-y-6"
    >
      {saveError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">The audience could not be saved.</p>
          <p className="mt-1 text-red-700">{saveError.message}</p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="audience-name" className="block text-sm font-medium text-slate-800">
          Name
        </label>
        <input
          id="audience-name"
          value={state.name}
          onChange={(event) => setState({ ...state, name: event.target.value })}
          onBlur={() => touch('name')}
          aria-invalid={nameError !== undefined}
          aria-describedby={nameError ? 'audience-name-error' : undefined}
          className="h-9 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 aria-invalid:border-red-500"
        />
        {nameError ? (
          <p id="audience-name-error" className="text-sm text-red-600">
            {nameError}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-800">Customers must match</legend>
        <div className="flex gap-4">
          {MATCH_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="match"
                value={option.value}
                checked={state.match === option.value}
                onChange={() => setState({ ...state, match: option.value })}
                className="size-4 accent-indigo-600"
              />
              {option.label}
            </label>
          ))}
        </div>

        <ol className="space-y-2" aria-label="Conditions">
          {state.conditions.map((condition, index) => (
            <ConditionRow
              key={condition.id}
              condition={condition}
              position={index + 1}
              errors={Object.fromEntries(
                Object.entries(errors.conditions[condition.id] ?? {}).filter(([field]) =>
                  isShown(`${condition.id}.${field}`),
                ),
              )}
              canRemove={state.conditions.length > 1}
              onChange={updateCondition}
              onRemove={() => removeCondition(condition.id)}
              onTouch={(field) => touch(`${condition.id}.${field}`)}
            />
          ))}
        </ol>

        <div className="flex items-center gap-3">
          <Button onClick={addCondition} disabled={!canAdd}>
            Add condition
          </Button>
          <span className="text-xs text-slate-500">
            {canAdd
              ? `${state.conditions.length} of ${MAX_FILTER_CONDITIONS} conditions`
              : `The limit is ${MAX_FILTER_CONDITIONS} conditions.`}
          </span>
        </div>
      </fieldset>

      <MemberCountPreview filter={filter} />

      <div className="flex gap-3 border-t border-slate-200 pt-6">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? 'Saving…' : submitLabel}
        </Button>
        <ButtonLink to="/" variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
