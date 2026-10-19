/**
 * Bakes the desktop app's pictures with the art package's Node renderer, the same drawings the
 * app draws: the app icon (from which `tauri icon` makes every size) and the menu-bar or tray
 * critter shown before anyone has signed in. Once someone has, the app draws their own critter
 * there itself. The files are generated, not committed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { bakeScene, createNodeArt } from '@kithfield/art/node';

const icons = join(import.meta.dirname, '..', 'src-tauri', 'icons');
const errors: string[] = [];
const art = await createNodeArt({ onError: (message) => errors.push(message) });

function write(name: string, bytes: Uint8Array): void {
  const out = join(icons, name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`wrote ${out}`);
}

write(
  'app-1024.png',
  bakeScene(art, { scene: 'appicon', width: 1024, height: 1024, dpr: 1, attrs: {} }, 0),
);
// The menu bar draws a 22-point icon; at 2x that is 44 pixels.
write(
  'tray.png',
  bakeScene(art, { scene: 'avatar', width: 22, height: 22, dpr: 2, attrs: { kind: 'rabbit' } }, 0),
);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
