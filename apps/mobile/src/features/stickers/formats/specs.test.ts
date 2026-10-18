import { describe, expect, it } from '@jest/globals';

import { assembleApng } from './apng';
import { png300, pngA, webm512, webmAudio, webmFast, webpLossy } from './fixtures.test-data';
import {
  checkMessagesSticker,
  checkTelegramIcon,
  checkTelegramSticker,
  checkWhatsAppPack,
  checkWhatsAppSticker,
  checkWhatsAppTray,
} from './specs';
import { assembleAnimatedWebp } from './webp';

const rules = (problems: readonly { rule: string }[]) => problems.map((p) => p.rule).sort();

const anim = (canvas: number, durationMs: number, frames = 2) =>
  assembleAnimatedWebp(
    { width: canvas, height: canvas, loops: 0 },
    Array.from({ length: frames }, () => ({ webp: webpLossy, x: 0, y: 0, durationMs })),
  );

const padded = (bytes: Uint8Array, length: number) => {
  const out = new Uint8Array(length);
  out.set(bytes);
  return out;
};

describe('WhatsApp rules', () => {
  it('passes a 512 animated sticker', () => {
    expect(checkWhatsAppSticker(anim(512, 33))).toEqual([]);
  });

  it('names each broken rule', () => {
    expect(rules(checkWhatsAppSticker(anim(256, 4)))).toEqual(['whatsapp.frame', 'whatsapp.size']);
    expect(rules(checkWhatsAppSticker(anim(512, 6000)))).toEqual(['whatsapp.duration']);
    expect(rules(checkWhatsAppSticker(webpLossy))).toEqual(['whatsapp.size']);
    expect(rules(checkWhatsAppSticker(pngA))).toEqual(['whatsapp.format']);
  });

  it('caps an animated sticker at 500 KB', () => {
    // A RIFF chunk of padding after the frames still parses, and counts towards the size.
    const big = anim(512, 33);
    const grown = padded(big, 501 * 1024);
    // Make the trailing bytes a valid chunk so the reader stops cleanly.
    grown.set([0x4a, 0x55, 0x4e, 0x4b], big.length);
    const size = grown.length - big.length - 8;
    grown.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, 0], big.length + 4);
    const riff = grown.length - 8;
    grown.set([riff & 0xff, (riff >> 8) & 0xff, (riff >> 16) & 0xff, (riff >> 24) & 0xff], 4);
    expect(rules(checkWhatsAppSticker(grown))).toEqual(['whatsapp.bytes']);
  });

  it('checks the tray icon and the pack size', () => {
    expect(rules(checkWhatsAppTray(pngA))).toEqual(['whatsapp.tray']);
    expect(rules(checkWhatsAppTray(webpLossy))).toEqual(['whatsapp.tray']);
    expect(checkWhatsAppPack(3)).toEqual([]);
    expect(checkWhatsAppPack(30)).toEqual([]);
    expect(rules(checkWhatsAppPack(2))).toEqual(['whatsapp.pack']);
    expect(rules(checkWhatsAppPack(31))).toEqual(['whatsapp.pack']);
  });
});

describe('Telegram rules', () => {
  it('passes a 512 VP9 clip', () => {
    expect(checkTelegramSticker(webm512)).toEqual([]);
  });

  it('names each broken rule', () => {
    expect(rules(checkTelegramSticker(webmAudio))).toEqual(['telegram.audio', 'telegram.size']);
    expect(rules(checkTelegramSticker(webmFast))).toEqual(['telegram.fps', 'telegram.size']);
    expect(rules(checkTelegramIcon(webm512))).toEqual(['telegram.icon.size']);
    expect(rules(checkTelegramIcon(webmFast))).toEqual(['telegram.icon.fps']);
    expect(rules(checkTelegramSticker(webpLossy))).toEqual(['telegram.format']);
  });
});

describe('Messages rules', () => {
  it('passes a square APNG in range', () => {
    const apng = assembleApng({ width: 300, height: 300, loops: 0 }, [
      { png: png300, x: 0, y: 0, delayMs: 33 },
    ]);
    expect(checkMessagesSticker(apng)).toEqual([]);
    expect(checkMessagesSticker(png300)).toEqual([]);
  });

  it('names each broken rule', () => {
    expect(rules(checkMessagesSticker(pngA))).toEqual(['messages.size']);
    expect(rules(checkMessagesSticker(webpLossy))).toEqual(['messages.format']);
  });
});
