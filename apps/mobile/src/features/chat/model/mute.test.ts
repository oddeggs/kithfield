import { describe, expect, it } from '@jest/globals';

import { muteSettings } from './mute';

const knockFor = { plans: true, doorstep: false, mentions: true, messages: true };

describe('muting a chat', () => {
  it('keeps what knocks as it was', async () => {
    await expect(muteSettings(() => Promise.resolve({ knockFor }), true)).resolves.toEqual({
      mutedUntil: 'always',
      knockFor,
    });
    await expect(muteSettings(() => Promise.resolve({ knockFor }), false)).resolves.toEqual({
      mutedUntil: null,
      knockFor,
    });
  });

  it('fails when the farm says this person is not on it', async () => {
    const notMember = Object.assign(new Error('404'), { status: 404 });
    await expect(muteSettings(() => Promise.reject(notMember), true)).rejects.toBe(notMember);
  });
});
