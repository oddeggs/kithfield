import { describe, expect, it } from '@jest/globals';

import { pushRecent, RECENT_MAX } from './recents';

describe('the recent row', () => {
  it('puts the newest first, once', () => {
    const a = { pack: 'mine', sticker: 'wave' };
    const b = { pack: 'mine', sticker: 'us', with: ['pip'] };
    expect(pushRecent([a, b], b)).toEqual([b, a]);
    expect(pushRecent([b], { pack: 'mine', sticker: 'us', with: ['bea'] })).toHaveLength(2);
  });

  it('holds eight', () => {
    let list: { pack: string; sticker: string }[] = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, { pack: 'mine', sticker: `s${i}` });
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]?.sticker).toBe('s11');
  });
});
