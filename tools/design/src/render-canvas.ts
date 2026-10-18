import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type Page } from 'playwright';

import { type DesignFile } from './design-file';
import { type TargetInfo, bringToTop, tagScreens, tagSections } from './in-page';
import { type RenderEntry } from './manifest';
import {
  WIDE_SCALE,
  parseLabel,
  renderFileName,
  scaleForWidth,
  titleSlug,
  uniqueSlugs,
} from './naming';
import { fileSelected, idSelected } from './select';
import { VARIANT_MIN_SHARE, decodePng, pixelDrift } from './png';
import { type Session, applyTweaks, closeDesignPage, openDesignPage } from './session';
import { parentVariants, tweakVariants } from './tweaks';

/**
 * Canvas files are laid out in a viewport larger than any frame or section (the widest frame is
 * about 2070 px, the tallest section, the cover's map, 4000 px): a capture that leaves the
 * viewport takes another raster path in Chromium, which then changes how later captures
 * rasterise. Frames have fixed sizes, so the width only moves them; sections reflow with it, so
 * section files keep the narrower width.
 */
const CANVAS_HEIGHT = 4200;

function canvasViewport(file: DesignFile, scale: number): { width: number; height: number } {
  const width = file.mode === 'screens' && scale === WIDE_SCALE ? 2400 : 1600;
  return { width, height: CANVAS_HEIGHT };
}

export interface RenderJob {
  session: Session;
  origin: string;
  outDir: string;
  tokens: string[];
}

interface Target {
  index: number;
  entry: RenderEntry;
}

function toTargets(file: DesignFile, infos: TargetInfo[]): Target[] {
  if (file.mode === 'screens') {
    return infos.flatMap((info) => {
      const label = parseLabel(info.label);
      if (!label) return [];
      return [{ index: info.index, entry: entry(file, label.id, label.title, info) }];
    });
  }
  const slugs = uniqueSlugs(infos.map((info) => titleSlug(info.label)));
  return infos.map((info, i) => {
    const id = `${file.slug}/${slugs[i] ?? 'section'}`;
    return { index: info.index, entry: entry(file, id, info.label, info) };
  });
}

function entry(file: DesignFile, id: string, title: string, info: TargetInfo): RenderEntry {
  const section = file.mode === 'sections';
  return {
    id,
    kind: section ? 'section' : 'screen',
    file: renderFileName(id),
    source: file.name,
    title,
    width: info.width,
    height: info.height,
    scale: section ? WIDE_SCALE : scaleForWidth(info.width),
    variants: {},
  };
}

function tag(page: Page, file: DesignFile): Promise<TargetInfo[]> {
  return file.mode === 'screens' ? page.evaluate(tagScreens) : page.evaluate(tagSections);
}

/**
 * Captures a target at exactly its CSS size: an element screenshot rounds a fractional box
 * outwards (a 852 px frame at 852.33 comes out a device pixel or two taller), so the clip is the
 * box's rounded origin and its layout size.
 */
async function capture(page: Page, index: number): Promise<Buffer> {
  const clip = await page.evaluate(bringToTop, index);
  return page.screenshot({ clip, animations: 'disabled', caret: 'hide', timeout: 60_000 });
}

/** A real difference, not the few pixels of drift two renders of the same state can show. */
function differs(before: Buffer | undefined, after: Buffer): boolean {
  if (!before) return true;
  if (before.equals(after)) return false;
  return pixelDrift(decodePng(before), decodePng(after)).share > VARIANT_MIN_SHARE;
}

function write(outDir: string, rel: string, png: Buffer): void {
  const path = join(outDir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
}

/**
 * Renders one canvas file: each target at its scale, under every tweak combination. A variant is
 * written only when it differs from the defaults and from every combination it builds on
 * (by more than compositor drift).
 */
export async function renderCanvasFile(job: RenderJob, file: DesignFile): Promise<RenderEntry[]> {
  const url = `${job.origin}/${encodeURIComponent(file.name)}`;
  const whole = fileSelected(file.slug, job.tokens);
  const variants = tweakVariants(file.tweaks);
  const firstScale = file.mode === 'screens' ? scaleForWidth(0) : WIDE_SCALE;
  const pages = new Map<number, Page>();
  const pageAt = async (scale: number): Promise<Page> => {
    const open = pages.get(scale);
    if (open) return open;
    const page = await openDesignPage(job.session, canvasViewport(file, scale), scale, url);
    pages.set(scale, page);
    return page;
  };
  try {
    const first = await pageAt(firstScale);
    const all = toTargets(file, await tag(first, file));
    const wanted = all.filter((t) => whole || idSelected(t.entry.id, job.tokens));
    for (const scale of [...new Set(wanted.map((t) => t.entry.scale))].sort()) {
      const page = await pageAt(scale);
      if (page !== first) await tag(page, file);
      const targets = wanted.filter((t) => t.entry.scale === scale);
      const shots = new Map<string, Map<number, Buffer>>();
      for (const variant of variants) {
        if (variant.suffix) {
          await applyTweaks(page, variant.props);
          const again = toTargets(file, await tag(page, file)).map((t) => t.entry.id);
          if (again.join() !== all.map((t) => t.entry.id).join()) {
            throw new Error(`${file.name}: frames changed under tweaks ${variant.suffix}`);
          }
        }
        const parents = parentVariants(variant, variants);
        const seen = new Map<number, Buffer>();
        shots.set(variant.suffix, seen);
        for (const { index, entry: e } of targets) {
          const png = await capture(page, index);
          seen.set(index, png);
          if (!variant.suffix) {
            write(job.outDir, e.file, png);
          } else if (parents.every((p) => differs(shots.get(p.suffix)?.get(index), png))) {
            const rel = renderFileName(e.id, variant.suffix);
            write(job.outDir, rel, png);
            e.variants[variant.suffix] = rel;
          }
        }
      }
    }
    return wanted.map((t) => t.entry);
  } finally {
    for (const page of pages.values()) await closeDesignPage(page);
  }
}
