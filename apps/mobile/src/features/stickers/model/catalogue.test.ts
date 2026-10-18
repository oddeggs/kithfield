import { describe, expect, it } from '@jest/globals';
import { ArtId, KNOWN_STICKER_PACKS, OWN_PACK, StickerPayload } from '@kithfield/contracts';
import { translator } from '@kithfield/i18n';

import {
  allPacks,
  exportOrder,
  lookOfSticker,
  offered,
  OWN,
  PACK_IDS,
  packOf,
  shopPacks,
  togetherPose,
  togetherStickers,
  togetherWith,
} from './catalogue';

describe('the sticker catalogue', () => {
  it('knows every pack the contracts name, the free one first', () => {
    expect(allPacks()[0]?.id).toBe(OWN_PACK);
    expect(new Set(allPacks().map((p) => p.id))).toEqual(new Set(KNOWN_STICKER_PACKS));
  });

  it('draws exactly the packs the contracts name, with the same own pack', () => {
    expect([...PACK_IDS].sort()).toEqual([...KNOWN_STICKER_PACKS].sort());
    expect(OWN).toBe(OWN_PACK);
  });

  it('keeps everyone’s own pack free and out of the shop', () => {
    expect(packOf(OWN_PACK)?.free).toBe(true);
    expect(shopPacks().every((p) => !p.free)).toBe(true);
    expect(shopPacks().some((p) => p.id === OWN_PACK)).toBe(false);
  });

  it('gives every sticker an id that travels and words in both languages', () => {
    const en = translator('en');
    const vi = translator('vi');
    for (const pack of allPacks()) {
      const ids = pack.stickers.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of pack.stickers) {
        expect(ArtId.safeParse(s.id).success).toBe(true);
        expect(StickerPayload.safeParse({ pack: pack.id, sticker: s.id }).success).toBe(true);
        if (s.caption === 'names' || s.caption === 'loveYouName' || s.caption === 'hiName')
          continue;
        expect(en(`stickers.cap.${s.caption}`)).not.toBe(`stickers.cap.${s.caption}`);
        expect(vi(`stickers.cap.${s.caption}`)).not.toBe('');
      }
    }
  });

  it('offers 24 of your own, with the reply-only ones kept for Quick Tend', () => {
    const own = packOf(OWN_PACK);
    if (!own) throw new Error('no own pack');
    expect(offered(own)).toHaveLength(24);
    expect(own.stickers.filter((s) => s.replyOnly).map((s) => s.id)).toContain('hi_you');
    expect(
      exportOrder(own)
        .map((s) => s.id)
        .slice(0, 8),
    ).toEqual(['wave', 'hug', 'love', 'laugh', 'sleepy', 'thanks', 'omw', 'yay']);
    expect(exportOrder(own)).toHaveLength(24);
  });

  it('draws a sticker it doesn’t know as a wave without words', () => {
    expect(lookOfSticker({ pack: 'next_year', sticker: 'moon' })).toEqual({
      pose: 'wave',
      caption: null,
      together: false,
    });
    expect(lookOfSticker({ pack: OWN_PACK, sticker: 'laugh' })).toEqual({
      pose: 'laugh',
      caption: 'ha',
      together: false,
    });
  });

  it('draws friends in a together sticker in the pose for how many there are', () => {
    const us = togetherStickers().find((d) => d.id === 'us');
    if (!us) throw new Error('no us');
    expect(togetherPose(us, 1)).toBe('hug2');
    expect(togetherPose(us, 3)).toBe('squad');
    expect(lookOfSticker({ pack: OWN_PACK, sticker: 'tower', with: ['a'] }).pose).toBe('stack');
    expect(lookOfSticker({ pack: OWN_PACK, sticker: 'unknown', with: ['a', 'b'] })).toEqual({
      pose: 'squad',
      caption: null,
      together: true,
    });
  });

  it('draws at most four friends, or the one a sticker is for', () => {
    const [us, , , , missed, , , thanks] = togetherStickers();
    if (!us || !missed || !thanks) throw new Error('missing together stickers');
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(togetherWith(us, five)).toEqual(['a', 'b', 'c', 'd']);
    expect(togetherWith(missed, five)).toEqual(['a']);
    expect(togetherWith(thanks, ['a', 'b'])).toEqual(['b']);
    expect(togetherWith(us, [])).toEqual([]);
  });
});
