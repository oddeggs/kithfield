import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fontFaces, fontFor, fonts, type, vietnamese, type FontName } from '@kithfield/theme';
import { describe, expect, it } from 'vitest';

import { readFont, type FontInfo } from './sfnt';
import { fontSources } from './sources';
import { fontsDir, verify } from './verify';
import { missingLetters, vietnameseLetters } from './vietnamese';

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
  it('are exactly the pinned Google Fonts files and licences', () => {
    expect(verify()).toEqual([]);
  });

  it('give every theme font a file, registered under the name the theme uses', () => {
    expect(fontSources.map((s) => s.name).sort()).toEqual(fontFaces.map((f) => f.name).sort());
    for (const face of fontFaces) {
      const font = fontInfo(face.name);
      expect(font.postScriptName).toBe(face.name);
      expect(font.family).toBe(face.family);
      expect(font.weight).toBe(face.weight);
      expect(face.file).toBe(`${face.name}.ttf`);
    }
  });
});

describe('Vietnamese coverage', () => {
  it('checks the full set of tone-marked letters, lower and upper case', () => {
    expect(vietnameseLetters).toHaveLength(134);
    for (const letter of 'ảạằẳẵặầẩẫậẻẽẹềểễệỉịỏọồổỗộờởỡợủụừửữựỳỷỹỵđĐẢẠỲỴƯƠ')
      expect(vietnameseLetters).toContain(letter);
  });

  it('finds Young Serif and Gaegu without Vietnamese', () => {
    // Young Serif has the Latin-1 and dot-below letters (à, ạ) but not ơ, ư or the stacked
    // marks, so a glyph-by-glyph fallback would mix two faces inside one word.
    expect(missing(fonts.youngSerif)).toEqual(
      expect.arrayContaining(['ơ', 'ư', 'ả', 'ằ', 'ệ', 'Ệ', 'Ữ']),
    );
    expect(missing(fonts.youngSerif)).not.toContain('ạ');
    expect(missing(fonts.gaeguBold)).toEqual(vietnameseLetters);
  });

  it('finds every tone-marked letter in Patrick Hand and Lora', () => {
    expect(missing(fonts.patrickHand)).toEqual([]);
    expect(missing(fonts.lora)).toEqual([]);
    expect(missing(fonts.loraSemiBold)).toEqual([]);
  });

  it('sets every Vietnamese style in a font that covers Vietnamese, or the system face', () => {
    for (const key of Object.keys(type) as (keyof typeof type)[]) {
      const { fontFamily } = fontFor(key, 'vi');
      if (fontFamily !== undefined) expect(missing(fontFamily), key).toEqual([]);
    }
    expect(missing(vietnamese.youngSerif.font)).toEqual([]);
    expect(missing(vietnamese.gaegu.font)).toEqual([]);
  });

  it('swaps every English face that lacks Vietnamese', () => {
    for (const key of Object.keys(type) as (keyof typeof type)[]) {
      const en = fontFor(key, 'en').fontFamily;
      if (en !== undefined && missing(en).length > 0)
        expect(fontFor(key, 'vi').fontFamily, key).not.toBe(en);
    }
  });
});
