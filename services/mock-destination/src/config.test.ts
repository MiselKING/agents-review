import { describe, expect, it } from 'vitest';

import { readSettings } from './config.ts';

const valid = {
  MOCK_DESTINATION_FAILURE_RATE: '0.2',
  MOCK_DESTINATION_RATE_LIMIT_PER_SECOND: '5',
};

describe('readSettings', () => {
  it('reads both settings', () => {
    expect(readSettings(valid)).toEqual({ failureRate: 0.2, rateLimitPerSecond: 5 });
  });

  it('accepts the edges: no failures and no rate limit', () => {
    expect(
      readSettings({
        MOCK_DESTINATION_FAILURE_RATE: '0',
        MOCK_DESTINATION_RATE_LIMIT_PER_SECOND: '0',
      }),
    ).toEqual({ failureRate: 0, rateLimitPerSecond: 0 });
  });

  it.each(['MOCK_DESTINATION_FAILURE_RATE', 'MOCK_DESTINATION_RATE_LIMIT_PER_SECOND'])(
    'names %s when it is missing',
    (name) => {
      expect(() => readSettings({ ...valid, [name]: undefined })).toThrow(
        `Missing environment variable ${name}`,
      );
    },
  );

  it.each([
    ['MOCK_DESTINATION_FAILURE_RATE', '1.5'],
    ['MOCK_DESTINATION_FAILURE_RATE', '-0.1'],
    ['MOCK_DESTINATION_FAILURE_RATE', 'often'],
    ['MOCK_DESTINATION_FAILURE_RATE', ' '],
    ['MOCK_DESTINATION_RATE_LIMIT_PER_SECOND', '2.5'],
    ['MOCK_DESTINATION_RATE_LIMIT_PER_SECOND', '-1'],
  ])('names %s when its value "%s" is invalid', (name, value) => {
    expect(() => readSettings({ ...valid, [name]: value })).toThrow(new RegExp(`^${name} must be`));
  });
});
