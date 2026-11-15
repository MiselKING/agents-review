import { describe, expect, it } from 'vitest';

import { isAcceptedEmail, MAX_MEMBER_EMAIL_LENGTH } from './ad-platform.ts';

describe('isAcceptedEmail', () => {
  it('accepts an address up to the length limit', () => {
    expect(isAcceptedEmail('ann@example.com')).toBe(true);
    const longest = `${'a'.repeat(MAX_MEMBER_EMAIL_LENGTH - 12)}@example.com`;
    expect(isAcceptedEmail(longest)).toBe(true);
    expect(isAcceptedEmail(`a${longest}`)).toBe(false);
  });

  it.each(['', 'ann', 'ann@', '@example.com', 'ann @example.com', 'a@b@c'])(
    'refuses %j',
    (email) => {
      expect(isAcceptedEmail(email)).toBe(false);
    },
  );
});
