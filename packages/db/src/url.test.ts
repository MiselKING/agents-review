import { describe, expect, it } from 'vitest';

import { describeDatabaseUrl, findPortMismatch } from './url.ts';

const url = 'postgres://user:s3cret@localhost:5433/agents_review';

describe('describeDatabaseUrl', () => {
  it('shows host, port and database without credentials', () => {
    const described = describeDatabaseUrl(url);
    expect(described).toBe('localhost:5433/agents_review');
    expect(described).not.toContain('s3cret');
    expect(described).not.toContain('user');
  });

  it('falls back to the default port', () => {
    expect(describeDatabaseUrl('postgres://localhost/db')).toBe('localhost:5432/db');
  });
});

describe('findPortMismatch', () => {
  it('passes when the ports match or POSTGRES_PORT is unset', () => {
    expect(findPortMismatch(url, '5433')).toBeUndefined();
    expect(findPortMismatch(url, undefined)).toBeUndefined();
  });

  it('reports both ports when they differ', () => {
    expect(findPortMismatch(url, '5432')).toMatch(/port 5433 but POSTGRES_PORT is 5432/);
  });
});
