import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fontFaces } from '@kithfield/theme';
import { describe, expect, it } from 'vitest';

import { Art } from './art';
import { parseFont } from './canvas2d/font';
import { TYPO_METRICS } from './faces';
import { loadNodeSkia, nodeFaces, themeFontDir } from './node';

/** The OS/2 typo ascender and descender of a TrueType file. */
function typoOf(file: string): [number, number] {
  const b = readFileSync(join(themeFontDir(), file));
  const tables = b.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const at = 12 + i * 16;
    if (b.toString('latin1', at, at + 4) !== 'OS/2') continue;
    const os2 = b.readUInt32BE(at + 8);
    return [b.readInt16BE(os2 + 68), -b.readInt16BE(os2 + 70)];
  }
  throw new Error(`${file} has no OS/2 table`);
}

describe('typo metrics', () => {
  it('match every embedded font file', () => {
    for (const face of fontFaces) expect(TYPO_METRICS[face.file]).toEqual(typoOf(face.file));
  });
});

describe('the em box', () => {
  const emOf = async (css: string) => {
    const skia = await loadNodeSkia();
    const art = new Art({ skia, faces: nodeFaces(skia) });
    const font = parseFont(css);
    if (!font) throw new Error('unparsed');
    const em = art.env.fonts.emBox(font);
    if (!em) throw new Error('no em box');
    return em;
  };

  // The middle baselines Chrome measures for these fonts.
  it.each([
    ['700 23px Gaegu, cursive', 5.984375],
    ["700 23px 'Patrick Hand', cursive", 6.125],
    ["700 10px 'Patrick Hand', cursive", 2.671875],
    ["400 14px 'Young Serif', serif", 3.375],
  ])('puts the middle of %s where Chrome does', async (css, middle) => {
    const em = await emOf(css);
    expect((em.ascent - em.descent) / 2).toBe(middle);
  });

  it('spans the font size', async () => {
    const em = await emOf("700 23px 'Patrick Hand', cursive");
    expect(em.ascent + em.descent).toBe(23);
  });
});
