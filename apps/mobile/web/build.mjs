// Builds the web app for hosting at `<host>/app`: Expo's web export into `dist-web/app/`, with
// the API on the same host, then the page every route falls back to at `dist-web/index.html`.
//
// The page's icons are baked from the art (`web/copy-assets.mjs`) and named in its head.
//
//   node web/build.mjs dev    (dev.kithfield.com)
//   node web/build.mjs prd    (kithfield.com)
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { WEB_ICONS } from './icons.mjs';

const variant = process.argv[2] === 'prd' ? 'prd' : 'dev';
const host = variant === 'prd' ? 'kithfield.com' : 'dev.kithfield.com';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist-web');
/** Where the page is served on its host. */
const base = '/app';

rmSync(out, { recursive: true, force: true });
execFileSync('node', ['web/copy-assets.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync(
  path.join(root, 'node_modules', '.bin', 'expo'),
  ['export', '--platform', 'web', '--output-dir', path.join(out, 'app')],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_VARIANT: variant,
      API_BASE: `https://${host}/api`,
      WEB_BASE_URL: base,
    },
  },
);
// Expo's page names no icon, so a browser would ask for `/favicon.ico`, which is the site's.
const icons = WEB_ICONS.map(
  ({ file, size, rel }) =>
    `<link rel="${rel}" type="image/png" sizes="${size}x${size}" href="${base}/${file}" />`,
).join('');
const page = readFileSync(path.join(out, 'app', 'index.html'), 'utf8').replace(
  '</head>',
  `${icons}</head>`,
);
writeFileSync(path.join(out, 'app', 'index.html'), page);
writeFileSync(path.join(out, 'index.html'), page);

/**
 * The page shares its origin with the API and keeps the session in the browser's storage, so
 * nothing but its own scripts may run in it (WebAssembly for Skia and SQLite), nothing may frame
 * it, and nothing is read as another kind than it is served. Styles are inline (React Native for
 * Web writes them), and media, link previews and the fire's calls reach other hosts over TLS.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
writeFileSync(
  path.join(out, '_headers'),
  [
    '/*',
    `  Content-Security-Policy: ${CSP}`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '',
    // Named by their content's hash: never changes under the same name.
    '/app/_expo/static/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n'),
);
console.log(`built the web app for https://${host}/app in ${out}`);
