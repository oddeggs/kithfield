/**
 * Puts a reference render next to a screenshot and writes a side-by-side sheet and a diff image:
 *
 *   pnpm --filter @kithfield/design compare -- <render.png> <screenshot.png> [--name <id>-sim]
 *
 * The screenshot is scaled to the render's width. Output: design/renders/compare/<name>.side.png
 * and <name>.diff.png (changed pixels in red over a faded render), plus the mean difference.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { diffPngs, pngBytes } from './pixel-diff';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  allowPositionals: true,
  options: { name: { type: 'string' }, threshold: { type: 'string', default: '16' } },
});
const [renderPath, shotPath] = positionals;
if (!renderPath || !shotPath) {
  console.error('usage: compare <render.png> <screenshot.png> [--name <name>] [--threshold 16]');
  process.exit(2);
}
// Paths are relative to where pnpm was invoked, not to this package.
const cwd = process.env['INIT_CWD'] ?? process.cwd();
const read = (path: string): Buffer => readFileSync(resolve(cwd, path));
const outDir = resolve(import.meta.dirname, '../../../design/renders/compare');
const name = values.name ?? basename(renderPath).replace(/\.png$/, '');

const browser = await chromium.launch();
try {
  const sheets = await diffPngs(
    browser,
    read(renderPath),
    read(shotPath),
    Number(values.threshold ?? 16),
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.side.png`), pngBytes(sheets.side));
  writeFileSync(join(outDir, `${name}.diff.png`), pngBytes(sheets.diff));
  console.log(
    `mean difference ${sheets.mean.toFixed(2)}/255, ${(sheets.changed * 100).toFixed(1)}% of pixels ` +
      `over the threshold (${sheets.differing} differ at all, by at most ${sheets.max}) ` +
      `→ design/renders/compare/${name}.{side,diff}.png`,
  );
} finally {
  await browser.close();
}
