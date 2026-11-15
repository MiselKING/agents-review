import { describe, expect, it } from 'vitest';

import { createRateLimiter } from './rate-limiter.ts';

describe('createRateLimiter', () => {
  it('allows the limit within one second, then asks to wait', () => {
    let now = 0;
    const take = createRateLimiter(3, () => now);
    expect([take(), take(), take(), take()]).toEqual([0, 0, 0, 1]);
    now = 999;
    expect(take()).toBe(1);
    now = 1000;
    expect(take()).toBe(0);
  });

  it('frees one slot per request that leaves the window', () => {
    let now = 0;
    const take = createRateLimiter(2, () => now);
    take();
    now = 500;
    take();
    now = 1000;
    expect(take()).toBe(0);
    expect(take()).toBe(1);
  });

  it('never limits with a limit of 0', () => {
    const take = createRateLimiter(0, () => 0);
    expect(Array.from({ length: 1000 }, () => take()).every((wait) => wait === 0)).toBe(true);
  });
});
