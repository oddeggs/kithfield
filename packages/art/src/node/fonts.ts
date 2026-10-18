import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type { SkiaApi } from '../canvas2d/skia-api';

import type { FaceEntry } from '../canvas2d/font';
import { faceEntries } from '../faces';

/** The directory holding the theme's font files. */
export function themeFontDir(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('@kithfield/theme/package.json')), 'fonts');
}

/** The embedded fonts, read from `@kithfield/theme/fonts`. */
export function nodeFaces(skia: SkiaApi): FaceEntry[] {
  const dir = themeFontDir();
  return faceEntries((face) =>
    skia.Typeface.MakeFreeTypeFaceFromData(
      skia.Data.fromBytes(new Uint8Array(readFileSync(join(dir, face.file)))),
    ),
  );
}
