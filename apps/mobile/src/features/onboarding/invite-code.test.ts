import { describe, expect, it } from '@jest/globals';

import { inviteCodeIn, inviteLinkIn } from './invite-code';

describe('invite links', () => {
  it('finds the code in a pasted link or a bare code', () => {
    expect(inviteCodeIn('https://kithfield.com/i/Ab3-xyz9')).toBe('Ab3-xyz9');
    expect(inviteCodeIn('kithfield.com/i/Ab3-xyz9?ref=1')).toBe('Ab3-xyz9');
    expect(inviteCodeIn('https://dev.kithfield.com/vi/i/abcd1234')).toBe('abcd1234');
    expect(inviteCodeIn('kithfield://i/abcd1234')).toBe('abcd1234');
    expect(inviteCodeIn('Come be a critter!\nhttps://kithfield.com/i/abcd1234')).toBe('abcd1234');
    expect(inviteCodeIn('  abcd1234 ')).toBe('abcd1234');
  });

  it('finds nothing in text without a code', () => {
    expect(inviteCodeIn('')).toBeNull();
    expect(inviteCodeIn('hello there')).toBeNull();
    expect(inviteCodeIn('https://example.com/about')).toBeNull();
  });

  it('offers only the farm link from the clipboard', () => {
    expect(inviteLinkIn('Come be a critter?\nhttps://kithfield.com/i/abcd1234')).toBe(
      'https://kithfield.com/i/abcd1234',
    );
    expect(inviteLinkIn('abcd1234')).toBeNull();
  });
});
