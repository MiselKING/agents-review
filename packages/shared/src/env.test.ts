import { describe, expect, it } from 'vitest';

import { readPort, requireEnv } from './env.ts';

describe('requireEnv', () => {
  it('returns the value when set', () => {
    expect(requireEnv('A', { A: 'x' })).toBe('x');
  });

  it('throws a hint to copy .env.example when missing or empty', () => {
    expect(() => requireEnv('A', {})).toThrow(/Copy \.env\.example to \.env/);
    expect(() => requireEnv('A', { A: '' })).toThrow(/Missing environment variable A/);
  });
});

describe('readPort', () => {
  it('parses a valid port', () => {
    expect(readPort('PORT', { PORT: '4000' })).toBe(4001);
  });

  it.each(['0', '65536', 'abc', '40.5'])('rejects %s', (value) => {
    expect(() => readPort('PORT', { PORT: value })).toThrow(/must be a port number/);
  });
});
