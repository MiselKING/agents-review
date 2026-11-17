import { Combobox } from '@base-ui/react/combobox';
import { useMemo } from 'react';

import type { CountriesQuery } from '../gql/graphql';
import { countryLabel, useCountries } from './api';

type Country = CountriesQuery['countries'][number];

interface CountryComboboxProps {
  id: string;
  label: string;
  value: string | null;
  onChange: (code: string | null) => void;
  onBlur: () => void;
  invalid: boolean;
  describedBy: string | undefined;
}

/** Searchable by name or code; stores the ISO 3166-1 alpha-3 code. */
export function CountryCombobox({
  id,
  label,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
}: CountryComboboxProps) {
  const countries = useCountries();
  const items = useMemo(
    () =>
      Combobox.createItems(countries.data ?? [], {
        getValue: (country) => country.code,
        getLabel: countryLabel,
      }),
    [countries.data],
  );

  const placeholder = countries.isPending
    ? 'Loading countries…'
    : countries.isError
      ? 'Countries could not be loaded'
      : 'Search country';

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(code) => onChange(code)}
      // A saved code no customer has any more still shows, as the code itself.
      itemToStringLabel={(code) => code}
      disabled={!countries.isSuccess}
      autoHighlight
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Combobox.InputGroup className="relative w-64">
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onBlur={onBlur}
          className="h-9 w-full rounded-md border border-slate-300 bg-white pr-9 pl-3 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 aria-invalid:border-red-500"
        />
        <Combobox.Trigger
          aria-label="Show countries"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12 6H4l4 4.5z" />
          </svg>
        </Combobox.Trigger>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-10 outline-none">
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
            <Combobox.Empty>
              <p className="px-3 py-2 text-slate-500">No country matches.</p>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none">
              {(country: Country) => (
                <Combobox.Item
                  key={country.code}
                  value={country.code}
                  className="flex cursor-default items-center justify-between gap-3 px-3 py-2 select-none data-highlighted:bg-indigo-50 data-highlighted:text-indigo-900"
                >
                  <span>{country.name}</span>
                  <span className="text-xs text-slate-500">{country.code}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
