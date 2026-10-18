import { describe, expect, it } from 'vitest';

import {
  fontFaces,
  fontFor,
  fonts,
  isVietnamese,
  naturalLineHeight,
  SYSTEM_LINE_HEIGHT,
  systemCss,
  vietnamese,
} from './fonts';
import { between, foundations, num, one, readDesign, textOf } from './test/design';
import { type } from './type';

const faceOf = (name: string) => {
  const f = fontFaces.find((x) => x.name === name);
  if (!f) throw new Error(`no embedded font ${name}`);
  return f;
};

const states = readDesign('12 States.dc.html');

describe('the Vietnamese stack matches the design', () => {
  it('swaps display and hand as 01 Foundations says', () => {
    const [loraWeight] = one(
      textOf(between(foundations(), 'id="type"', 'id="space"')),
      /For Vietnamese, Young Serif becomes Lora (\d+) and Gaegu becomes Patrick Hand/,
    ).map(num);
    expect(faceOf(vietnamese.youngSerif.font)).toMatchObject({
      family: 'Lora',
      weight: loraWeight,
    });
    expect(faceOf(vietnamese.gaegu.font)).toMatchObject({ family: 'Patrick Hand', weight: 400 });
  });

  it('agrees with the developer note for the Vietnamese state', () => {
    expect(textOf(states)).toContain('swap display to Lora 600 and hand to Patrick Hand');
  });

  it('sets each swapped face at the size the whole-stack sample does', () => {
    const block = between(states, 'id="vi-fonts"', 'More empty states');
    const [display, hand] = one(
      block,
      /font:400 (\d+)px\/1\.2 'Young Serif'.*?font:700 (\d+)px\/1\.2 Gaegu/s,
    ).map(num);
    const [lora, patrick] = one(
      block,
      /font:600 (\d+)px\/1\.2 'Lora'.*?font:400 (\d+)px\/1\.2 'Patrick Hand'/s,
    ).map(num);
    expect(vietnamese.youngSerif.sizeDelta).toBe(lora! - display!);
    expect(vietnamese.gaegu.sizeDelta).toBe(patrick! - hand!);
    const [ratio] = one(textOf(block), /line height rises to ([\d.]+)/).map(num);
    expect(vietnamese.minLineHeightRatio).toBe(ratio);
  });

  it('names every family with the CSS stack the design uses', () => {
    const design = foundations() + states + readDesign('17 Landing VI.dc.html');
    for (const f of fontFaces)
      expect(design, f.name).toMatch(
        new RegExp(`font:${f.weight} [\\d.]+px/[\\d.]+ ${f.css.replace(/[()]/g, '\\$&')}`),
      );
    expect(design).toContain(systemCss);
  });
});

describe('fontFor', () => {
  it('sets English in Young Serif, Gaegu and the system face', () => {
    expect(fontFor('displayL', 'en')).toEqual({
      fontFamily: fonts.youngSerif,
      fontSize: 34,
      lineHeight: 37,
      letterSpacing: 0,
    });
    expect(fontFor('handS', 'en')).toEqual({
      fontFamily: fonts.gaeguBold,
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

  it('swaps the whole stack for Vietnamese and keeps the system face', () => {
    expect(fontFor('displayS', 'vi')).toEqual({
      fontFamily: fonts.loraSemiBold,
      fontSize: 17,
      lineHeight: 20,
      letterSpacing: 0,
    });
    expect(fontFor('handS', 'vi-VN')).toEqual({
      fontFamily: fonts.patrickHand,
      fontSize: 17,
      lineHeight: 17,
      letterSpacing: 0,
    });
    expect(fontFor('handL', 'vi')).toEqual({
      fontFamily: fonts.patrickHand,
      fontSize: 22,
      lineHeight: 24,
      letterSpacing: 0,
    });
    expect(fontFor('body', 'vi')).toEqual(fontFor('body', 'en'));
  });

  it('opens up wrapping Vietnamese lines, and only those', () => {
    expect(fontFor('body', 'vi', { multiline: true }).lineHeight).toBe(22);
    expect(fontFor('displayL', 'vi', { multiline: true }).lineHeight).toBe(48);
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
    expect(naturalLineHeight(fonts.youngSerif)).toBe(1.412);
    expect(naturalLineHeight(fonts.gaeguBold)).toBe(1.25);
    expect(naturalLineHeight(undefined)).toBeCloseTo(1.1934, 4);
    expect(naturalLineHeight('Menlo')).toBeCloseTo(1.164, 3);
    expect(naturalLineHeight('Georgia')).toBe(SYSTEM_LINE_HEIGHT);
  });
});
