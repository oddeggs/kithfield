/**
 * Downloads the embedded fonts and their licences from Google Fonts into a fresh directory,
 * checks each against its pinned SHA-256 and PostScript name, then copies them into
 * `packages/theme/fonts/`. With `--check`, only verifies the committed files (no network).
 *
 *   pnpm --filter @kithfield/fonts download [--work <empty dir for the downloads>]
 *   pnpm --filter @kithfield/fonts verify
 */
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { allSources } from './sources';
import { fontsDir, problemWith, verify } from './verify';

async function download(work: string): Promise<void> {
  for (const source of allSources) {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const problem = problemWith(source, bytes);
    if (problem) throw new Error(problem);
    writeFileSync(join(work, source.file), bytes);
    console.log(`  ${source.file} ${Math.round(bytes.byteLength / 1024)} KB`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { check: { type: 'boolean' }, work: { type: 'string' } },
  });
  if (!values.check) {
    const work = values.work ?? mkdtempSync(join(tmpdir(), 'kithfield-fonts-'));
    mkdirSync(work, { recursive: true });
    if (readdirSync(work).length > 0) throw new Error(`${work} is not empty`);
    console.log(`Downloading into ${work}`);
    await download(work);
    mkdirSync(fontsDir, { recursive: true });
    for (const source of allSources)
      copyFileSync(join(work, source.file), join(fontsDir, source.file));
  }
  const problems = verify();
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${allSources.length} files in ${fontsDir} match their sources`);
}

await main();
