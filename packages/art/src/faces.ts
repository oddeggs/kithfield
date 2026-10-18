import type { SkTypeface } from '@shopify/react-native-skia';
import { fontFaces, type FontFace } from '@kithfield/theme';

import type { FaceEntry } from './canvas2d/font';
import type { SkiaApi } from './canvas2d/skia-api';

/**
 * The theme's embedded fonts as the renderer names them in CSS (`Gaegu`, `'Patrick Hand'`,
 * `'Young Serif'`, `Lora`), given a way to load each file as a typeface.
 */
export function faceEntries(load: (face: FontFace) => SkTypeface | null): FaceEntry[] {
  const out: FaceEntry[] = [];
  for (const face of fontFaces) {
    const typeface = load(face);
    if (!typeface) throw new Error(`Could not load the font ${face.file}`);
    out.push({ family: face.family, weight: face.weight, typeface });
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
