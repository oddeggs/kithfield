import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  artFontFaces,
  fontFaces,
  fontFor,
  fonts,
  hand,
  type,
  type FontName,
} from '@kithfield/theme';
import { describe, expect, it } from 'vitest';

import { readFont, type FontInfo } from './sfnt';
import { fontSources } from './sources';
import { fontsDir, verify } from './verify';
import { missingLetters, missingMarks, vietnameseLetters } from './vietnamese';

const info = new Map<string, FontInfo>(
  fontSources.map((s) => [s.name, readFont(new Uint8Array(readFileSync(join(fontsDir, s.file))))]),
);
const fontInfo = (name: FontName): FontInfo => {
  const i = info.get(name);
  if (!i) throw new Error(`no file for ${name}`);
  return i;
};
const missing = (name: FontName) => missingLetters(fontInfo(name).codePoints);

describe('embedded font files', () => {
  it('are exactly the pinned files and licences', () => {
    expect(verify()).toEqual([]);
  });

  it('give every theme font a file, registered under the name the theme uses', () => {
    const faces = new Map([...fontFaces, ...artFontFaces].map((f) => [f.name, f]));
    expect(fontSources.map((s) => s.name).sort()).toEqual([...faces.keys()].sort());
    for (const face of faces.values()) {
      const font = fontInfo(face.name);
      expect(font.postScriptName).toBe(face.name);
      expect(font.family).toBe(face.family);
      expect(font.weight).toBe(face.weight);
      expect(face.file).toBe(`${face.name}.ttf`);
    }
  });

  it('cut the instances from pinned variable fonts with every axis pinned', () => {
    for (const s of fontSources)
      if (s.recipe.kind === 'instance') {
        expect(s.recipe.from.sha256, s.name).toMatch(/^[0-9a-f]{64}$/);
        expect(Object.keys(s.recipe.axes).length, s.name).toBeGreaterThan(0);
      }
  });
});

const displayFonts = [fonts.display18, fonts.display36, fonts.display72] as const;
const marks = (name: FontName) => missingMarks(fontInfo(name).codePoints);

describe('Vietnamese coverage', () => {
  it('checks the full set of tone-marked letters, lower and upper case', () => {
    expect(vietnameseLetters).toHaveLength(134);
    for (const letter of 'ảạằẳẵặầẩẫậẻẽẹềểễệỉịỏọồổỗộờởỡợủụừửữựỳỷỹỵđĐẢẠỲỴƯƠ')
      expect(vietnameseLetters).toContain(letter);
  });

  it('finds every tone-marked letter in the app’s faces', () => {
    for (const face of fontFaces) expect(missing(face.name), face.name).toEqual([]);
  });

  it('finds every combining mark in Kithfield Hand, and Fraunces without two of them', () => {
    expect(hand.name).toBe(fonts.hand);
    expect(marks(fonts.hand)).toEqual([]);
    // Decomposed "ả" or "ạ" would fall back inside a word in Fraunces: its text is precomposed.
    for (const name of displayFonts) expect(marks(name), name).toEqual([0x309, 0x323]);
  });

  it('keeps the subset to Latin and Vietnamese', () => {
    const points = fontInfo(fonts.hand).codePoints;
    expect(points.has('가'.codePointAt(0) ?? 0)).toBe(false);
    expect(points.has('Ａ'.codePointAt(0) ?? 0)).toBe(false);
    for (const ch of 'Aa?!’“”Ấỗẳ\u0301\u0323')
      expect(points.has(ch.codePointAt(0) ?? 0), ch).toBe(true);
  });

  it('sets every style of the ramp in a face that writes Vietnamese, in either language', () => {
    for (const locale of ['en', 'vi'])
      for (const key of Object.keys(type) as (keyof typeof type)[]) {
        const { fontFamily } = fontFor(key, locale);
        if (fontFamily !== undefined) expect(missing(fontFamily), `${locale} ${key}`).toEqual([]);
      }
  });

  it('keeps the art’s fonts as the art draws them: Gaegu and Young Serif without Vietnamese', () => {
    expect(missing(fonts.gaeguBold)).toEqual(vietnameseLetters);
    expect(missing(fonts.youngSerif)).toEqual(expect.arrayContaining(['ơ', 'ư', 'ệ']));
    expect(missing(fonts.patrickHand)).toEqual([]);
  });
});
