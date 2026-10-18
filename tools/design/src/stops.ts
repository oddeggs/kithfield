/** Where to stop when rendering a scrolling page one viewport at a time. */

import { titleSlug, uniqueSlugs } from './naming';

export interface SectionBox {
  label: string;
  top: number;
  height: number;
}

export interface ScrollStop {
  /** `critters`, or `evening-03` for the third viewport of a tall (pinned, scroll-driven) section. */
  name: string;
  y: number;
}

/** A width the landing pages are rendered at: the viewport and its device scale. */
export interface PageWidth {
  width: number;
  height: number;
  scale: number;
}

/** Mobile (an iPhone), tablet (an 11" iPad, portrait) and desktop. */
export const PAGE_WIDTHS: readonly PageWidth[] = [
  { width: 390, height: 844, scale: 3 },
  { width: 834, height: 1194, scale: 2 },
  { width: 1440, height: 900, scale: 1 },
];

/**
 * One stop per viewport height through each section, so a tall pinned section (whose stage
 * changes as you scroll) is captured at several points. Stops past the end of the page are
 * clamped to the last scrollable offset; empty sections are skipped.
 */
export function scrollStops(
  sections: readonly SectionBox[],
  viewportHeight: number,
  pageHeight: number,
): ScrollStop[] {
  const maxY = Math.max(0, pageHeight - viewportHeight);
  const visible = sections.filter((s) => s.height >= 1);
  const slugs = uniqueSlugs(visible.map((s) => titleSlug(s.label)));
  const stops: ScrollStop[] = [];
  visible.forEach((section, i) => {
    const slug = slugs[i] ?? 'section';
    const count = Math.max(1, Math.ceil((section.height - 1) / viewportHeight));
    for (let k = 0; k < count; k++) {
      const y = Math.round(Math.min(maxY, section.top + k * viewportHeight));
      const name = count === 1 ? slug : `${slug}-${String(k + 1).padStart(2, '0')}`;
      stops.push({ name, y });
    }
  });
  return stops;
}
