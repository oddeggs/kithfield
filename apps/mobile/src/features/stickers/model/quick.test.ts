import { describe, expect, it } from '@jest/globals';
import { StickerPayload } from '@kithfield/contracts';

import { lookOfSticker } from './catalogue';
import { quickStickers } from './quick';

describe('stickers as Quick Tend answers', () => {
  it('answers news with a cheer and the two of you, replying to it', () => {
    const offer = quickStickers(
      { why: 'question', actor: 'bea', seq: 41 },
      'june',
      new Set(['bea']),
    );
    expect(offer).toEqual([
      { pack: 'mine', sticker: 'yay', replyTo: 41 },
      { pack: 'mine', sticker: 'so_proud', replyTo: 41 },
      { pack: 'mine', sticker: 'us', with: ['bea'], replyTo: 41 },
    ]);
    for (const s of offer) expect(StickerPayload.safeParse(s).success).toBe(true);
  });

  it('never draws in a friend who can’t be drawn', () => {
    const offer = quickStickers({ why: 'back', actor: 'otis', seq: 7 }, 'june', new Set());
    expect(offer.map((s) => s.sticker)).toEqual(['hi_you', 'miss', 'welcome_home']);
    expect(offer.every((s) => s.with === undefined)).toBe(true);
  });

  it('only offers stickers the app can draw', () => {
    for (const why of ['question', 'plan', 'back', 'mention', 'doorstep', 'birthday'] as const) {
      for (const s of quickStickers({ why, actor: 'bea', seq: 1 }, 'june', new Set(['bea']))) {
        expect(lookOfSticker(s).caption).not.toBeNull();
      }
    }
  });
});
