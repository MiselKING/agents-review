import { describe, expect, it } from 'vitest';

import { toCountryOptions } from './countries.ts';

describe('toCountryOptions', () => {
  it('names each code in English and sorts by name', () => {
    expect(toCountryOptions(['SWE', 'DEU', 'FRA'])).toEqual([
      { code: 'FRA', name: 'France' },
      { code: 'DEU', name: 'Germany' },
      { code: 'SWE', name: 'Sweden' },
    ]);
  });

  it('uses the code as the name when the code is unknown', () => {
    expect(toCountryOptions(['XXX'])).toEqual([{ code: 'XXX', name: 'XXX' }]);
  });
});
