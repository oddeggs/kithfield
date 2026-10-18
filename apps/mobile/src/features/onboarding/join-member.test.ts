import { describe, expect, it } from '@jest/globals';
import type { JoinRequest } from '@kithfield/contracts';

import { ApiError } from '../../data/api-client';
import { me } from '../../ui/session/me.test-data';
import { joinAsMember } from './join-member';

describe('joining another farm from a link, already a critter', () => {
  it('moves in with the name and critter the person already has', async () => {
    const joined: [string, JoinRequest][] = [];
    const result = await joinAsMember('abcd', {
      me: () => Promise.resolve(me()),
      join: (code, join) => Promise.resolve(void joined.push([code, join])),
    });
    expect(result).toBe('ok');
    expect(joined).toEqual([['abcd', { name: 'June', critter: me().critter }]]);
  });

  it('says when the farm filled up or the invite went meanwhile', async () => {
    const fail = (status: number, code: 'farm_full' | 'invite_invalid') =>
      joinAsMember('abcd', {
        me: () => Promise.resolve(me()),
        join: () => Promise.reject(new ApiError(status, code)),
      });
    await expect(fail(409, 'farm_full')).resolves.toBe('full');
    await expect(fail(404, 'invite_invalid')).resolves.toBe('gone');
  });

  it('fails without joining when the person has no critter yet', async () => {
    let joined = false;
    const result = await joinAsMember('abcd', {
      me: () => Promise.resolve(me({ critter: null })),
      join: () => Promise.resolve(void (joined = true)),
    });
    expect(result).toBe('failed');
    expect(joined).toBe(false);
  });
});
