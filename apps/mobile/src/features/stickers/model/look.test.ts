import { describe, expect, it } from '@jest/globals';
import type { Critter } from '@kithfield/contracts';
import { translator } from '@kithfield/i18n';

import { captionText, NO_CAPTION, sceneOfSticker, stickerAttrs } from './look';

const en = translator('en');
const june: Critter = {
  species: 'rabbit',
  coat: 'default',
  mark: null,
  accessory: 'scarf',
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
};
const pip: Critter = { ...june, species: 'hedgehog', accessory: null };

describe('the words on a sticker', () => {
  it('writes the plain ones from the catalogue', () => {
    expect(captionText(en, 'ha', { people: ['June'] })).toBe('HA!');
    expect(captionText(en, null, { people: [] })).toBe(NO_CAPTION);
  });

  it('names everyone in a together sticker, or falls back without names', () => {
    expect(captionText(en, 'names', { people: ['June', 'Pip'] })).toBe('June + Pip');
    expect(captionText(en, 'names', { people: ['June', null] })).toBe('the gang');
    expect(captionText(en, 'loveYouName', { people: ['June', 'Mo'] })).toBe('love you Mo');
    expect(captionText(en, 'loveYouName', { people: ['June'] })).toBe('love you');
  });

  it('says hello by name to whoever it answers', () => {
    expect(captionText(en, 'hiName', { people: ['June'], replyTo: 'Otis' })).toBe('hi Otis!');
    expect(captionText(en, 'hiName', { people: ['June'] })).toBe('hi?');
  });
});

describe('a sticker as the art draws it', () => {
  it('wears what the sender wears now, with the friends drawn beside them', () => {
    const attrs = sceneOfSticker(
      en,
      { pack: 'mine', sticker: 'us', with: ['pip', 'gone'] },
      { name: 'June', critter: june },
      (p) => (p === 'pip' ? { name: 'Pip', critter: pip } : null),
    );
    expect(attrs).toMatchObject({
      kind: 'rabbit',
      outfit: 'scarf',
      pose: 'hug2',
      caption: 'June + Pip',
    });
    expect(attrs['cast']).toBe('hedgehog/////');
    expect(attrs['lang']).toBe('en');
    expect(
      sceneOfSticker(translator('vi'), { pack: 'mine', sticker: 'miss' }, null, () => null)['lang'],
    ).toBe('vi');
  });

  it('draws a rabbit when the sender isn’t known', () => {
    expect(stickerAttrs(null, 'wave', 'hi!')).toEqual({
      kind: 'rabbit',
      pose: 'wave',
      caption: 'hi!',
    });
  });
});
