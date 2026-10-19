import { describe, expect, it } from 'vitest';

import {
  artFontFaces,
  display,
  displayAt,
  displayCut,
  fontFaces,
  fontFor,
  fonts,
  isVietnamese,
  naturalLineHeight,
  SYSTEM_LINE_HEIGHT,
  systemCss,
  vietnamese,
} from './fonts';
import { hand } from './hand';
import { between, foundations, num, one, readDesign, textOf } from './test/design';
import { type } from './type';

const states = readDesign('12 States.dc.html');

describe('the faces', () => {
  it('cut the display face at optical sizes that rise with the designed size', () => {
    expect(display.cuts.map((c) => c.opsz)).toEqual([18, 36, 72]);
    expect(displayCut(17).name).toBe(fonts.display18);
    expect(displayCut(23.5).name).toBe(fonts.display18);
    expect(displayCut(24).name).toBe(fonts.display36);
    expect(displayCut(34).name).toBe(fonts.display36);
    expect(displayCut(60).name).toBe(fonts.display72);
  });

  it('keep the design’s line box and scale the display size to Fraunces', () => {
    expect(displayAt(34)).toEqual({ fontFamily: fonts.display36, fontSize: 36.5 });
    expect(displayAt(60)).toEqual({ fontFamily: fonts.display72, fontSize: 64.75 });
  });

  it('keep the art’s fonts under the names the art’s CSS uses', () => {
    const art = readDesign('kithfield-art.js');
    for (const f of artFontFaces) expect(art, f.family).toContain(f.family);
    const embedded = new Set(Object.values(fonts));
    for (const f of [...fontFaces, ...artFontFaces])
      expect(embedded.has(f.name), f.name).toBe(true);
  });

  it('name the system face as the design’s CSS does', () => {
    expect(foundations()).toContain(systemCss);
  });
});

describe('the Vietnamese line height', () => {
  it('rises as the developer note for the Vietnamese state says', () => {
    const block = between(states, 'id="vi-fonts"', 'More empty states');
    const [ratio] = one(textOf(block), /line height rises to ([\d.]+)/).map(num);
    expect(vietnamese.minLineHeightRatio).toBe(ratio);
  });
});

describe('fontFor', () => {
  it('sets display in Fraunces, hand in Kithfield Hand, and the system face by weight', () => {
    expect(fontFor('displayL', 'en')).toEqual({
      fontFamily: fonts.display36,
      fontSize: 36.5,
      lineHeight: 37,
      letterSpacing: 0,
    });
    expect(fontFor('displayS', 'en')).toEqual({
      fontFamily: fonts.display18,
      fontSize: 18,
      lineHeight: 20,
      letterSpacing: 0,
    });
    expect(fontFor('handS', 'en')).toEqual({
      fontFamily: hand.name,
      fontSize: 15,
      lineHeight: 15,
      letterSpacing: 0,
    });
    expect(fontFor('label', 'en')).toEqual({
      fontWeight: '700',
      fontSize: 12,
      lineHeight: 12,
      letterSpacing: 0.72,
      textTransform: 'uppercase',
    });
  });

  it('sets Vietnamese in the same faces as English', () => {
    for (const key of Object.keys(type) as (keyof typeof type)[])
      expect(fontFor(key, 'vi'), key).toEqual(fontFor(key, 'en'));
  });

  it('opens up wrapping Vietnamese lines, and only those', () => {
    expect(fontFor('body', 'vi', { multiline: true }).lineHeight).toBe(22);
    // Fraunces is set at 36.5 for the design's 34: 1.4 of that.
    expect(fontFor('displayL', 'vi', { multiline: true }).lineHeight).toBe(51);
    expect(fontFor('displayL', 'en', { multiline: true }).lineHeight).toBe(37);
    expect(fontFor(type.caption, 'vi', { multiline: true }).lineHeight).toBe(19);
  });

  it('treats only vi tags as Vietnamese', () => {
    expect(isVietnamese('vi')).toBe(true);
    expect(isVietnamese('vi-VN')).toBe(true);
    expect(isVietnamese('VI')).toBe(true);
    expect(isVietnamese('vi_VN')).toBe(true);
    expect(isVietnamese('en')).toBe(false);
    expect(isVietnamese('video')).toBe(false);
  });
});

describe('natural line height', () => {
  it('is each face’s own, SF Pro’s for the system face', () => {
    expect(naturalLineHeight(fonts.display36)).toBe(1.233);
    expect(naturalLineHeight(fonts.gaeguBold)).toBe(1.25);
    expect(naturalLineHeight(undefined)).toBeCloseTo(1.1934, 4);
    expect(naturalLineHeight('Menlo')).toBeCloseTo(1.164, 3);
    expect(naturalLineHeight('Georgia')).toBe(SYSTEM_LINE_HEIGHT);
  });
});
