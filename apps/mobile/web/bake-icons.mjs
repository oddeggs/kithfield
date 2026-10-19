// Bakes the page's icons into `public/` with the art package's Node renderer, the same drawing as
// the phone's and the desktop's app icon: the tab's icon and the one a phone keeps when the page
// is added to its home screen. Generated, not committed; `web/build.mjs` points the page at them.
//
//   node --import tsx web/bake-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { bakeScene, createNodeArt } from '@kithfield/art/node';

import { WEB_ICONS } from './icons.mjs';

const out = path.resolve(import.meta.dirname, '..', 'public');
const errors = [];
const art = await createNodeArt({ onError: (message) => errors.push(message) });
mkdirSync(out, { recursive: true });
for (const { file, size } of WEB_ICONS) {
  const req = { scene: 'appicon', width: size, height: size, dpr: 1, attrs: {} };
  writeFileSync(path.join(out, file), bakeScene(art, req, 0));
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
