import type { SkTypeface } from '@shopify/react-native-skia';
import { artFontFaces, type FontFace } from '@kithfield/theme';

import type { FaceEntry } from './canvas2d/font';
import type { SkiaApi } from './canvas2d/skia-api';

/**
 * Each embedded font's OS/2 typo ascender and descender (font units), which place the `top`,
 * `middle` and `bottom` canvas baselines. The phone's typefaces come from the system and expose
 * no tables, so the numbers live here; a test reads them back from the font files.
 */
export const TYPO_METRICS: Readonly<Record<string, readonly [number, number]>> = {
  'YoungSerif-Regular.ttf': [1046, 366],
  'Gaegu-Bold.ttf': [760, 240],
  'PatrickHand-Regular.ttf': [1024, 312],
};

/**
 * The art's fonts as the renderer names them in CSS (`Gaegu`, `'Patrick Hand'`, `'Young Serif'`),
 * given a way to load each file as a typeface.
 */
export function faceEntries(load: (face: FontFace) => SkTypeface | null): FaceEntry[] {
  const out: FaceEntry[] = [];
  for (const face of artFontFaces) {
    const typeface = load(face);
    if (!typeface) throw new Error(`Could not load the font ${face.file}`);
    const typo = TYPO_METRICS[face.file];
    out.push({ family: face.family, weight: face.weight, typeface, ...(typo ? { typo } : {}) });
  }
  return out;
}

/**
 * The same faces from the fonts the app embeds natively (`expo-font` registers them with the
 * system), so the phone loads no font files of its own.
 */
export function systemFaces(skia: SkiaApi): FaceEntry[] {
  const mgr = skia.FontMgr.System();
  return faceEntries((face) => mgr.matchFamilyStyle(face.family, { weight: face.weight }));
}
