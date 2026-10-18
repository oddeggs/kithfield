/**
 * Runs the golden scenes and prints each one's difference; with `--out <dir>` it also writes
 * `<id>.chrome.png`, `<id>.skia.png` and `<id>.diff.png` for the scenes over the limit (or all of
 * them with `--all`). `--only <substring>` narrows the set.
 *
 *   pnpm --filter @kithfield/art golden [--only farm] [--out /tmp/goldens] [--all]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadNodeSkia } from '../node';
import { AlphaType, ColorType, ImageFormat } from '../canvas2d/skia-enums';
import { diffImage, GOLDEN_MEAN_LIMIT } from './compare';
import { runGoldens } from './run';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const only = arg('--only');
const outDir = arg('--out');
const all = process.argv.includes('--all');
const skia = await loadNodeSkia();

const png = (rgba: Uint8Array, width: number, height: number) => {
  const data = skia.Data.fromBytes(rgba);
  const img = skia.Image.MakeImage(
    {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Premul,
    },
    data,
    width * 4,
  );
  if (!img) throw new Error('could not encode');
  return img.encodeToBytes(ImageFormat.PNG, 100);
};

if (outDir) mkdirSync(outDir, { recursive: true });
let failed = 0;
const results = await runGoldens(
  (s) => !only || s.id.includes(only),
  (r) => {
    const pass = r.mean <= GOLDEN_MEAN_LIMIT && r.errors.length === 0;
    if (!pass) failed++;
    console.log(
      `${pass ? 'ok  ' : 'FAIL'} ${r.scene.id.padEnd(34)} mean ${r.mean.toFixed(3)}  >16 ${(r.over16 * 100).toFixed(2)}%  max ${r.max}${r.errors.length ? `  errors: ${r.errors.join('; ')}` : ''}`,
    );
    if (outDir && (all || !pass)) {
      writeFileSync(join(outDir, `${r.scene.id}.chrome.png`), png(r.chrome, r.width, r.height));
      writeFileSync(join(outDir, `${r.scene.id}.skia.png`), png(r.skia, r.width, r.height));
      writeFileSync(
        join(outDir, `${r.scene.id}.diff.png`),
        png(diffImage(r.chrome, r.skia), r.width, r.height),
      );
    }
  },
);
const worst = results.reduce((a, r) => Math.max(a, r.mean), 0);
console.log(`${results.length} scenes, ${failed} over the limit, worst mean ${worst.toFixed(3)}`);
process.exit(failed ? 1 : 0);
