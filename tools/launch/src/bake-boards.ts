import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp, { type Sharp } from 'sharp';

import { type Board, type Boards } from './board';
import { rewritesFor, stillEnglish } from './copy';
import { captureScale, sliceRects } from './fit';
import { type BoxInfo, type Rewrite } from './in-page';
import { type ManifestEntry } from './manifest';
import { LAUNCH_FILE, STORE_DIR } from './paths';
import { type BoardJob } from './specs';

/** Writes an opaque PNG (the stores refuse alpha in screenshots and graphics). */
export async function writeOpaquePng(file: string, image: Sharp): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  const png = await image
    .flatten({ background: '#F5EEE2' })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  writeFileSync(file, png);
}

/** The board's own Vietnamese set, as rewrites from its English set. */
export async function boardRewrites(page: Board): Promise<Record<string, Rewrite>> {
  return page.rewrites('13-03', '13-04');
}

async function boxAt(page: Board, frame: string, box: number): Promise<BoxInfo> {
  const found = (await page.boxes(frame))[box];
  if (!found) throw new Error(`${frame} has no box ${box}`);
  return found;
}

/** Bakes one job on a page already open at the job's scale. */
async function bakeJob(
  page: Board,
  job: BoardJob,
  fromBoard: Record<string, Rewrite>,
): Promise<ManifestEntry[]> {
  const info = await boxAt(page, job.frame, job.box);
  if (info.width !== job.css[0] || info.height !== job.css[1]) {
    throw new Error(
      `${job.id}: ${job.frame} box ${job.box} is ${info.width}×${info.height}, expected ${job.css.join('×')}`,
    );
  }
  const ref = job.reference ? await boxAt(page, job.reference.frame, job.reference.box) : info;
  const { png, untranslated } = await page.capture(job.frame, job.box, {
    rewrite: rewritesFor(job.language, fromBoard),
  });
  const meta = await sharp(png).metadata();
  const rects = sliceRects([meta.width, meta.height], job.slices, job.size);
  const left = job.language === 'vi' ? stillEnglish(untranslated) : [];
  if (left.length > 0) console.warn(`  ${job.id}: still in English: ${left.join(' | ')}`);
  const entries: ManifestEntry[] = [];
  for (const [i, rect] of rects.entries()) {
    const file = job.files[i];
    if (!file) throw new Error(`${job.id}: no file for slice ${i + 1}`);
    await writeOpaquePng(join(STORE_DIR, file), sharp(png).extract(rect));
    const panel = ref.width / job.slices;
    entries.push({
      file,
      slot: job.slot,
      width: rect.width,
      height: rect.height,
      language: job.language,
      source: `${job.frame} box ${job.box}${job.slices > 1 ? `, panel ${i + 1} of ${job.slices}` : ''}`,
      reference: {
        render: (job.reference ?? job).frame,
        rect: [ref.x + i * panel, ref.y, panel, ref.height],
      },
      ...(left.length > 0 ? { stillEnglish: left } : {}),
    });
  }
  return entries;
}

/** Bakes the board jobs, one page per capture scale. */
export async function bakeBoards(
  boards: Boards,
  jobs: readonly BoardJob[],
  tweaks: Record<string, unknown>,
): Promise<ManifestEntry[]> {
  const groups = new Map<number, BoardJob[]>();
  for (const job of jobs) {
    const scale = Math.round(captureScale(job.css, job.slices, job.size) * 1e4) / 1e4;
    groups.set(scale, [...(groups.get(scale) ?? []), job]);
  }
  const entries: ManifestEntry[] = [];
  for (const [scale, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    const started = Date.now();
    const page = await boards.open(LAUNCH_FILE, scale, tweaks);
    try {
      const fromBoard = await boardRewrites(page);
      for (const job of group) {
        entries.push(...(await bakeJob(page, job, fromBoard)));
        console.log(`  ${job.id} (${job.files.length} at ${job.size.join('×')})`);
      }
    } finally {
      await page.close();
    }
    console.log(
      `scale ${scale}: ${group.length} jobs in ${((Date.now() - started) / 1000).toFixed(0)}s`,
    );
  }
  return entries;
}
