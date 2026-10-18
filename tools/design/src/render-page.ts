import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type DesignFile } from './design-file';
import { jumpTo, pageSections } from './in-page';
import { type RenderEntry } from './manifest';
import { type RenderJob } from './render-canvas';
import { closeDesignPage, openDesignPage, settle } from './session';
import { PAGE_WIDTHS, scrollStops } from './stops';

/**
 * Renders a scrolling page (the landing pages) at each width, one viewport per scroll stop:
 * `<file-slug>/<width>/<stop>.png`. Scroll-driven scenes run their scroll handlers on the paused
 * clock, so each stop shows the stage exactly as it sits at that offset.
 */
export async function renderScrollingPage(
  job: RenderJob,
  file: DesignFile,
): Promise<RenderEntry[]> {
  const url = `${job.origin}/${encodeURIComponent(file.name)}`;
  const entries: RenderEntry[] = [];
  for (const size of PAGE_WIDTHS) {
    const viewport = { width: size.width, height: size.height };
    const page = await openDesignPage(job.session, viewport, size.scale, url);
    try {
      const { sections, pageHeight, topInset } = await page.evaluate(pageSections);
      for (const stop of scrollStops(sections, size.height, pageHeight, topInset)) {
        await page.evaluate(jumpTo, stop.y);
        await settle(page, true);
        const id = `${file.slug}/${size.width}/${stop.name}`;
        const rel = `${id}.png`;
        const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
        mkdirSync(dirname(join(job.outDir, rel)), { recursive: true });
        writeFileSync(join(job.outDir, rel), png);
        entries.push({
          id,
          kind: 'page',
          file: rel,
          source: file.name,
          title: `${stop.name} at ${size.width}px (scrolled to ${stop.y})`,
          width: size.width,
          height: size.height,
          scale: size.scale,
          variants: {},
        });
      }
    } finally {
      await closeDesignPage(page);
    }
  }
  return entries;
}
