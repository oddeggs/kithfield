// Builds the web app for hosting at `<host>/app`: Expo's web export into `dist-web/app/`, with
// the API on the same host, then the page every route falls back to at `dist-web/index.html`.
//
//   node web/build.mjs dev    (dev.kithfield.com)
//   node web/build.mjs prd    (kithfield.com)
import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const variant = process.argv[2] === 'prd' ? 'prd' : 'dev';
const host = variant === 'prd' ? 'kithfield.com' : 'dev.kithfield.com';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist-web');

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
      WEB_BASE_URL: '/app',
    },
  },
);
copyFileSync(path.join(out, 'app', 'index.html'), path.join(out, 'index.html'));
console.log(`built the web app for https://${host}/app in ${out}`);
