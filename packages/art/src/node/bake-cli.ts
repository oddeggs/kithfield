/**
 * Bakes one scene to a file with the adapter on CanvasKit.
 *
 *   pnpm --filter @kithfield/art bake <scene> --out farm.png [--width 390] [--height 520]
 *     [--dpr 3] [--t 1.2] [--attr season=autumn --attr night=true …]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { bakeScene } from './bake';
import { createNodeArt } from './index';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    width: { type: 'string', default: '390' },
    height: { type: 'string', default: '520' },
    dpr: { type: 'string', default: '3' },
    t: { type: 'string', default: '1.2' },
    attr: { type: 'string', multiple: true, default: [] },
  },
});

const scene = positionals[0];
if (!scene || !values.out) {
  console.error('usage: bake <scene> --out <file> [--width] [--height] [--dpr] [--t] [--attr k=v]');
  process.exit(2);
}
const attrs: Record<string, string | boolean> = {};
for (const a of values.attr) {
  const i = a.indexOf('=');
  if (i < 0) attrs[a] = true;
  else attrs[a.slice(0, i)] = a.slice(i + 1);
}
const errors: string[] = [];
const art = await createNodeArt({ onError: (m) => errors.push(m) });
const bytes = bakeScene(
  art,
  {
    scene,
    width: Number(values.width),
    height: Number(values.height),
    dpr: Number(values.dpr),
    attrs,
  },
  Number(values.t),
);
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const out = resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
