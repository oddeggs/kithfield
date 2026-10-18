import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { type DesignFile, listDesignFiles } from './design-file';
import { type RenderEntry, type RenderIndex, buildIndex, mergeIndex } from './manifest';
import { parseLabel } from './naming';
import { type RenderJob, renderCanvasFile } from './render-canvas';
import { renderScrollingPage } from './render-page';
import { fileSelected, idSelected } from './select';
import { serveDirectory } from './server';
import { endSession, startSession } from './session';

export interface RunOptions {
  designDir: string;
  outDir: string;
  cacheDir: string;
  tokens: string[];
  offline: boolean;
  concurrency: number;
}

export interface RunSummary {
  entries: RenderEntry[];
  /** Screen ids written in the sources (for the selected files). */
  sourceIds: string[];
  /** Selected source ids that produced no PNG. */
  missingIds: string[];
  failures: string[];
}

function selectedFiles(files: DesignFile[], tokens: string[]): DesignFile[] {
  return files.filter(
    (f) =>
      fileSelected(f.slug, tokens) ||
      f.labels.some((l) => idSelected(parseLabel(l)?.id ?? '', tokens)),
  );
}

/** Before a full run: empties the output, keeping the committed comparison sheets. */
function clearOutput(outDir: string): void {
  if (!existsSync(outDir)) return;
  for (const name of readdirSync(outDir)) {
    if (name !== 'compare') rmSync(join(outDir, name), { recursive: true, force: true });
  }
}

/** After a partial run: drops variant PNGs of a re-rendered id that no longer differ. */
function pruneStaleVariants(outDir: string, entry: RenderEntry): void {
  const dir = join(outDir, dirname(entry.file));
  const base = basename(entry.id);
  const keep = new Set([entry.file, ...Object.values(entry.variants)].map((f) => basename(f)));
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(`${base}.`) && name.endsWith('.png') && !keep.has(name)) {
      rmSync(join(dir, name));
    }
  }
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  });
  await Promise.all(workers);
}

function readIndex(path: string): RenderIndex | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RenderIndex;
  } catch {
    return null;
  }
}

/** Renders the selected files into `outDir` and writes (or updates) its `index.json`. */
export async function renderDesign(options: RunOptions): Promise<RunSummary> {
  const files = selectedFiles(listDesignFiles(options.designDir), options.tokens);
  const partial = options.tokens.length > 0;
  if (!partial) clearOutput(options.outDir);
  const server = await serveDirectory(options.designDir);
  const session = await startSession({
    origin: server.origin,
    cacheDir: options.cacheDir,
    offline: options.offline,
  });
  const job: RenderJob = { session, origin: server.origin, outDir: options.outDir, tokens: options.tokens };
  const entries: RenderEntry[] = [];
  const failures: string[] = [];
  try {
    await pool(files, options.concurrency, async (file) => {
      const started = Date.now();
      try {
        const done =
          file.mode === 'page'
            ? await renderScrollingPage(job, file)
            : await renderCanvasFile(job, file);
        entries.push(...done);
        const variants = done.reduce((n, e) => n + Object.keys(e.variants).length, 0);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`${file.name}: ${done.length} renders, ${variants} variants (${secs}s)`);
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`${file.name}: failed`, error);
      }
    });
  } finally {
    await endSession(session);
    await server.close();
  }
  const indexPath = join(options.outDir, 'index.json');
  const index = buildIndex(entries);
  const merged = partial ? mergeIndex(readIndex(indexPath), index) : index;
  writeFileSync(indexPath, `${JSON.stringify(merged, null, 2)}\n`);
  if (partial) for (const entry of entries) pruneStaleVariants(options.outDir, entry);

  const sourceIds = [
    ...new Set(
      files.flatMap((f) =>
        f.labels
          .map((l) => parseLabel(l)?.id ?? '')
          .filter((id) => id && (fileSelected(f.slug, options.tokens) || idSelected(id, options.tokens))),
      ),
    ),
  ].sort();
  const rendered = new Set(entries.filter((e) => e.kind === 'screen').map((e) => e.id));
  return { entries, sourceIds, missingIds: sourceIds.filter((id) => !rendered.has(id)), failures };
}
