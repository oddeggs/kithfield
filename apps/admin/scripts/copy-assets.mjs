// Copies what the console serves as static files into `.wrangler/assets` (ignored by git and the linters): the art
// renderer, synced from the design, and the Young Serif face from the theme. Wrangler runs it
// before `dev` and `deploy`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const require = createRequire(join(root, 'package.json'));
const out = join(root, '.wrangler', 'assets');
mkdirSync(join(out, 'art'), { recursive: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

copyFileSync(
  require.resolve('@kithfield/art/kithfield-art.js'),
  join(out, 'art', 'kithfield-art.js'),
);
const theme = dirname(require.resolve('@kithfield/theme/package.json'));
copyFileSync(
  join(theme, 'fonts', 'YoungSerif-Regular.ttf'),
  join(out, 'fonts', 'YoungSerif-Regular.ttf'),
);
