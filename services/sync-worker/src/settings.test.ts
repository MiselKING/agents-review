import { describe, expect, it } from 'vitest';

import { readSettings } from './settings.ts';

describe('readSettings', () => {
  it('reads the destination URL', () => {
    expect(
      readSettings({ SYNC_DESTINATION_URL: 'http://localhost:4100' }).destinationUrl.href,
    ).toBe('http://localhost:4100/');
  });

  it('names the variable when it is missing', () => {
    expect(() => readSettings({})).toThrow('Missing environment variable SYNC_DESTINATION_URL');
  });

  it.each(['localhost:4100', 'not a url', 'ftp://example.com'])(
    'names the variable when the value "%s" is invalid',
    (value) => {
      expect(() => readSettings({ SYNC_DESTINATION_URL: value })).toThrow(
        /^SYNC_DESTINATION_URL must be an http or https URL/,
      );
    },
  );
});
