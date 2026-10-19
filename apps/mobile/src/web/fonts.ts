import { artFontFaces, fontFaces, type FontFace } from '@kithfield/theme';
import { Skia, type FontStyle, type SkTypeface } from '@shopify/react-native-skia';

import { webAsset } from './base-url';

/**
 * The theme's fonts in the browser. On the phone they are embedded natively: the text finds the
 * app's faces (Fraunces and Kithfield Hand) by name, and the art's renderer finds its own faces
 * through Skia's system font manager. Here the files are served beside the app
 * (`web/copy-assets.mjs`): the page's text gets the app's faces as `@font-face`s under the same
 * PostScript names, and Skia gets every face as a typeface through a font manager that answers
 * `matchFamilyStyle` (CanvasKit's own `System()` has no fonts and can't match).
 */
const url = (face: FontFace) => webAsset(`fonts/${face.file}`);

function addFontFaces(): void {
  const css = fontFaces
    .map(
      (face) =>
        `@font-face{font-family:'${face.name}';src:url('${url(face)}') format('truetype');font-display:block}`,
    )
    .join('\n');
  const style = document.createElement('style');
  // Fields show focus with their own border, as on the phone, not the browser's ring.
  style.textContent = `${css}\ninput:focus,textarea:focus,select:focus{outline:none}`;
  document.head.appendChild(style);
}

async function typefaces(): Promise<Map<FontFace, SkTypeface>> {
  const out = new Map<FontFace, SkTypeface>();
  await Promise.all(
    [...fontFaces, ...artFontFaces].map(async (face) => {
      const bytes = new Uint8Array(await (await fetch(url(face))).arrayBuffer());
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes));
      if (typeface) out.set(face, typeface);
    }),
  );
  return out;
}

/** Loads the fonts for the page and for Skia; resolves once both can draw with them. */
export async function loadWebFonts(): Promise<void> {
  addFontFaces();
  const loaded = await typefaces();
  const match = (family: string, style: FontStyle): SkTypeface | null => {
    const weight = style.weight ?? 400;
    const candidates = [...loaded].filter(([face]) => face.family === family);
    candidates.sort(
      ([a], [b]) => Math.abs(Number(a.weight) - weight) - Math.abs(Number(b.weight) - weight),
    );
    return candidates[0]?.[1] ?? null;
  };
  const system = Skia.FontMgr.System.bind(Skia.FontMgr);
  // The art asks the system font manager for the theme's families; answer from the loaded files.
  Skia.FontMgr.System = () => Object.assign(system(), { matchFamilyStyle: match });
  await Promise.all(
    fontFaces.map((face) => document.fonts.load(`16px '${face.name}'`).catch(() => [])),
  );
}
