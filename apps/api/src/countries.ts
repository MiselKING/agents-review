import countries from 'i18n-iso-countries';

export interface CountryOption {
  code: string;
  name: string;
}

/** English names for ISO 3166-1 alpha-3 codes, sorted by name. Unknown codes are named by their code. */
export function toCountryOptions(codes: readonly string[]): CountryOption[] {
  return codes
    .map((code) => ({ code, name: countries.getName(code, 'en') ?? code }))
    .toSorted((a, b) => a.name.localeCompare(b.name, 'en'));
}
