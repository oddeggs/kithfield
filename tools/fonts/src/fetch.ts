/**
 * Rebuilds the embedded fonts and their licences into a fresh directory, then copies them into
 * `packages/theme/fonts/` once each matches its pinned SHA-256 and PostScript name. Fonts used as
 * published are downloaded from google/fonts; the Fraunces cuts are made from its variable font
 * (fontTools `varLib.instancer`) and the hand fonts are subset (`pyftsubset`) by
 * `instances/build.py`, which needs the pinned fontTools. Kithfield Hand and its log come from the
 * designer, in the directory given as `--local`.
 *
 *   python3 -m venv <venv> && <venv>/bin/pip install -r tools/fonts/instances/requirements.txt
 *   KF_FONTS_PYTHON=<venv>/bin/python pnpm --filter @kithfield/fonts download \
 *     --local <dir with KithfieldHand-Bold.ttf and FONTLOG.txt> [--work <empty dir>]
 *   pnpm --filter @kithfield/fonts verify      # only checks the committed files, no network
 *
 * When a recipe or an input changes, the run fails naming each new file's SHA-256: check the
 * file, then pin it in `src/sources.ts`.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { fontInputs, fontSources, licenceSources, SUBSET_ARGS, type Source } from './sources';
import { committed, fontsDir, problemWith, sha256, verify } from './verify';

const buildScript = join(import.meta.dirname, '../instances/build.py');

/** The designer's names for the files they hand over, by the name each is committed under. */
const LOCAL_NAMES: Readonly<Record<string, string>> = {
  'FONTLOG-KithfieldHand.txt': 'FONTLOG.txt',
};

async function fetchInto(source: Source, dir: string, local: string | undefined): Promise<void> {
  let bytes: Uint8Array;
  if (source.url !== undefined) {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    if (local === undefined)
      throw new Error(`${source.file} comes from the designer: pass --local`);
    const path = join(local, LOCAL_NAMES[source.file] ?? source.file);
    if (!existsSync(path)) throw new Error(`${path}: missing`);
    bytes = new Uint8Array(readFileSync(path));
  }
  const hash = sha256(bytes);
  if (hash !== source.sha256)
    throw new Error(`${source.file}: SHA-256 ${hash}, expected ${source.sha256}`);
  writeFileSync(join(dir, source.file), bytes);
  console.log(`  ${source.file} ${Math.round(bytes.byteLength / 1024)} KB`);
}

/** Makes the instances and subsets from `inputs` into `work`. */
function build(inputs: string, work: string): void {
  const jobs: Record<string, unknown>[] = [];
  for (const s of fontSources) {
    const output = join(work, s.file);
    if (s.recipe.kind === 'instance') {
      const { from, axes, family, style, weight } = s.recipe;
      const source = join(inputs, from.file);
      jobs.push({
        kind: 'instance',
        source,
        output,
        axes,
        family,
        style,
        weight,
        postScriptName: s.name,
      });
    } else if (s.recipe.kind === 'subset')
      jobs.push({
        kind: 'subset',
        source: join(inputs, s.recipe.from.file),
        output,
        args: SUBSET_ARGS,
      });
  }
  const spec = join(work, 'build.json');
  writeFileSync(spec, JSON.stringify({ jobs }));
  const python = process.env['KF_FONTS_PYTHON'] ?? 'python3';
  execFileSync(python, ['-I', buildScript, spec], { stdio: 'inherit' });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean' },
      work: { type: 'string' },
      local: { type: 'string' },
    },
  });
  if (!values.check) {
    const work = values.work ?? mkdtempSync(join(tmpdir(), 'kithfield-fonts-'));
    mkdirSync(work, { recursive: true });
    if (readdirSync(work).length > 0) throw new Error(`${work} is not empty`);
    const inputs = join(work, 'in');
    mkdirSync(inputs);
    console.log(`Building in ${work}`);
    for (const source of fontInputs) await fetchInto(source, inputs, values.local);
    for (const source of licenceSources) await fetchInto(source, work, values.local);
    for (const font of fontSources)
      if (font.recipe.kind === 'download')
        await fetchInto(
          { file: font.file, url: font.recipe.url, sha256: font.sha256 },
          work,
          values.local,
        );
    build(inputs, work);
    const problems = committed.flatMap((s) => {
      const problem = problemWith(s, new Uint8Array(readFileSync(join(work, s.file))));
      return problem ? [problem] : [];
    });
    if (problems.length > 0) {
      for (const p of problems) console.error(`  ${p}`);
      process.exitCode = 1;
      return;
    }
    mkdirSync(fontsDir, { recursive: true });
    for (const s of committed) copyFileSync(join(work, s.file), join(fontsDir, s.file));
  }
  const problems = verify();
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${committed.length} files in ${fontsDir} match their sources`);
}

await main();
