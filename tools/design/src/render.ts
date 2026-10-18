/**
 * Renders the design export to PNG references in design/renders.
 *
 *   pnpm --filter @kithfield/design render [-- --only <id>,<file number>] [--offline] [--concurrency 4]
 *   pnpm --filter @kithfield/design render -- --check-determinism [--only …] [--keep]
 *
 * See tools/design/README.md for the naming scheme.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { diffHashes, hashPngs, treeDigest } from './hashes';
import { DETERMINISM_TOLERANCE, decodePng, pixelDrift } from './png';
import { type RunOptions, type RunSummary, renderDesign } from './run';
import { parseOnly } from './select';

const root = resolve(import.meta.dirname, '../../..');

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    only: { type: 'string' },
    out: { type: 'string' },
    offline: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    'check-determinism': { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
});

const base: RunOptions = {
  designDir: join(root, 'design'),
  outDir: values.out
    ? resolve(process.env['INIT_CWD'] ?? process.cwd(), values.out)
    : join(root, 'design/renders'),
  cacheDir: join(import.meta.dirname, '../node_modules/.cache/kithfield-design'),
  tokens: parseOnly(values.only),
  offline: values.offline,
  concurrency: Number(values.concurrency) || 4,
};

function report(summary: RunSummary, seconds: number): void {
  const count = (kind: string): number => summary.entries.filter((e) => e.kind === kind).length;
  const variants = summary.entries.reduce((n, e) => n + Object.keys(e.variants).length, 0);
  console.log(
    `\n${count('screen')} screens (of ${summary.sourceIds.length} ids in the sources), ` +
      `${variants} variants, ${count('section')} sections, ${count('page')} page stops ` +
      `in ${seconds.toFixed(0)}s`,
  );
  if (summary.missingIds.length) console.log(`Not rendered: ${summary.missingIds.join(', ')}`);
  for (const failure of summary.failures) console.log(`Failed: ${failure}`);
}

async function main(): Promise<number> {
  const started = Date.now();
  if (!values['check-determinism']) {
    const summary = await renderDesign(base);
    report(summary, (Date.now() - started) / 1000);
    return summary.failures.length || summary.missingIds.length ? 1 : 0;
  }
  // Two clean renders of the same selection into temporary folders, compared file by file.
  const scratch = mkdtempSync(join(tmpdir(), 'kithfield-renders-'));
  try {
    const runs = [];
    for (const name of ['first', 'second']) {
      const outDir = join(scratch, name);
      const summary = await renderDesign({ ...base, outDir, tokens: base.tokens });
      if (summary.failures.length) throw new Error(summary.failures.join('\n'));
      runs.push(hashPngs(outDir));
    }
    const [a = new Map<string, string>(), b = new Map<string, string>()] = runs;
    const diff = diffHashes(a, b);
    console.log(`\n${diff.same} of ${a.size} PNGs byte-identical across two runs`);
    console.log(`digest ${treeDigest(a)} / ${treeDigest(b)}`);
    // Byte-identical is the goal. A handful of pixels can still differ (an antialiased rotated
    // edge, a system-font glyph placed a pixel apart); that drift is reported, and tolerated up
    // to DETERMINISM_TOLERANCE of a render's pixels.
    let beyond = 0;
    for (const path of diff.changed) {
      const read = (run: string): Buffer => readFileSync(join(scratch, run, path));
      const d = pixelDrift(decodePng(read('first')), decodePng(read('second')));
      if (d.share > DETERMINISM_TOLERANCE) beyond++;
      console.log(
        `drift: ${path} (${d.differing} pixels, ${(d.share * 100).toFixed(4)}%, ` +
          `by at most ${d.max}/255)${d.share > DETERMINISM_TOLERANCE ? ' OVER TOLERANCE' : ''}`,
      );
    }
    for (const path of [...diff.onlyInFirst, ...diff.onlyInSecond])
      console.log(`only once: ${path}`);
    console.log(`(${((Date.now() - started) / 1000).toFixed(0)}s)`);
    return beyond || diff.onlyInFirst.length || diff.onlyInSecond.length ? 1 : 0;
  } finally {
    if (values.keep) console.log(`kept both runs in ${scratch}`);
    else rmSync(scratch, { recursive: true, force: true });
  }
}

process.exitCode = await main();
