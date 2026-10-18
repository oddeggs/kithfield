import { describe, expect, it } from 'vitest';

import { stickerColours } from './stickers';
import { readDesign } from './test/design';

const stickers = readDesign('08 Stickers.dc.html');
const system = readDesign('10 On the System.dc.html');
const c = stickerColours.day;

describe('the sticker colours match 08 Stickers and 10 On the System', () => {
  it('writes each designed day colour inline in the designs', () => {
    const inline = [
      c.pack.big_feelings,
      c.pack.cosy_weather,
      c.pack.birthday_bloom,
      c.pack.good_luck,
      c.preview,
      c.telegramTile,
      c.whatsappTile,
      c.wraps['clay'],
      c.wraps['dusk'],
      c.wraps['fern'],
      c.wraps['honey'],
    ];
    for (const colour of inline) {
      expect(`${stickers}${system}`.toLowerCase()).toContain(String(colour).toLowerCase());
    }
  });

  it('has the same jobs at night', () => {
    expect(Object.keys(stickerColours.night).sort()).toEqual(
      Object.keys(stickerColours.day).sort(),
    );
    expect(Object.keys(stickerColours.night.pack).sort()).toEqual(Object.keys(c.pack).sort());
  });
});
