/**
 * Copies the design's renderer into the package, byte for byte, and writes the module the app,
 * the baker and the tests evaluate it through.
 *
 *   pnpm --filter @kithfield/art sync [--check]
 *
 * `--check` writes nothing and fails when either file is stale, so a changed drawing without a
 * re-sync fails the tests.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderFiles } from '../src/sync/render';

const files = renderFiles(
  readFileSync(join(import.meta.dirname, '../../../design/kithfield-art.js')),
);
const check = process.argv.includes('--check');
const stale: string[] = [];

for (const file of files) {
  const url = join(import.meta.dirname, '../src/vendor', file.name);
  let current: Buffer | null;
  try {
    current = readFileSync(url);
  } catch {
    current = null;
  }
  if (current?.equals(file.bytes)) continue;
  if (check) stale.push(file.name);
  else {
    writeFileSync(url, file.bytes);
    console.log(`wrote src/vendor/${file.name} (${file.bytes.length} bytes)`);
  }
}

if (stale.length > 0) {
  console.error(`stale: ${stale.join(', ')}. Run pnpm --filter @kithfield/art sync`);
  process.exit(1);
}
