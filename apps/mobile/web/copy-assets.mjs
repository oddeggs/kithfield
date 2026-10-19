// Copies what the web build loads at runtime into `public/`, from the installed packages, so the
// versions always match: CanvasKit (Skia), sql.js (the browser's store) and the theme's fonts.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));
const skia = path.dirname(require.resolve('@shopify/react-native-skia/package.json'));
const canvaskit = createRequire(path.join(skia, 'package.json')).resolve(
  'canvaskit-wasm/bin/full/canvaskit.wasm',
);
const sqlJs = require.resolve('sql.js/dist/sql-wasm-browser.wasm');

const out = path.join(root, 'public');
mkdirSync(out, { recursive: true });
copyFileSync(canvaskit, path.join(out, 'canvaskit.wasm'));
copyFileSync(sqlJs, path.join(out, 'sql-wasm-browser.wasm'));

const fonts = path.join(path.dirname(require.resolve('@kithfield/theme/package.json')), 'fonts');
mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const file of readdirSync(fonts).filter((name) => name.endsWith('.ttf'))) {
  copyFileSync(path.join(fonts, file), path.join(out, 'fonts', file));
}
