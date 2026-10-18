import { describe, expect, it } from '@jest/globals';

import { inviteCodeIn, inviteLinkIn, joinPathFor } from './invite-code';

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

  it('sends an opened invite link to the join route, and leaves other links alone', () => {
    expect(joinPathFor('/i/abcd1234')).toBe('/join/abcd1234');
    expect(joinPathFor('kithfield-dev://i/abcd1234')).toBe('/join/abcd1234');
    expect(joinPathFor('https://kithfield.com/i/abcd1234?x=1')).toBe('/join/abcd1234');
    expect(joinPathFor('https://kithfield.com/vi/i/abcd1234')).toBe('/join/abcd1234');
    expect(joinPathFor('/farm')).toBeNull();
    expect(joinPathFor('/join/abcd1234')).toBeNull();
    expect(joinPathFor('kithfield-dev://expo-development-client/?url=x')).toBeNull();
  });
});
