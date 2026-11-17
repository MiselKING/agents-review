import { describe, expect, it } from 'vitest';

import { formatDuration, isFinished, statusLabel } from './format';

describe('formatDuration', () => {
  it.each([
    [850, '850 ms'],
    [42_000, '42 s'],
    [185_000, '3 min 5 s'],
    [120_000, '2 min'],
    [3_720_000, '1 h 2 min'],
    [3_600_000, '1 h'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('status helpers', () => {
  it('names each status with a word', () => {
    expect(statusLabel('QUEUED')).toBe('Queued');
    expect(statusLabel('RUNNING')).toBe('Running');
    expect(statusLabel('SUCCEEDED')).toBe('Succeeded');
    expect(statusLabel('FAILED')).toBe('Failed');
  });

  it('knows which statuses are finished', () => {
    expect(isFinished('SUCCEEDED')).toBe(true);
    expect(isFinished('FAILED')).toBe(true);
    expect(isFinished('QUEUED')).toBe(false);
    expect(isFinished('RUNNING')).toBe(false);
  });
});
