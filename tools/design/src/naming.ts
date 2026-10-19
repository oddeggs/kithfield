/** Pure naming rules for the renders: ids from screen labels, slugs, scales and file names. */

export interface ScreenLabel {
  /** The label's leading token, e.g. `NN-NN`. */
  id: string;
  /** The rest of the label, e.g. `Farm home (try the season and night tweaks)`. */
  title: string;
}

/** Splits a `data-screen-label` value into its id (the leading token) and its title. */
export function parseLabel(label: string): ScreenLabel | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const match = /^(\S+)\s*(.*)$/s.exec(trimmed);
  if (!match?.[1]) return null;
  return { id: match[1], title: (match[2] ?? '').replace(/\s+/g, ' ').trim() };
}

/** A screen id as the design writes it: `NN-NN`. */
const SCREEN_ID = /^\d{2}-\d{2}$/;

/**
 * The labels of one file's frames, in order, each with an id no other frame of the file shares.
 * A label that does not start with a screen id (`Plan link card 1200×630`) takes the file's slug.
 * A repeated id keeps its first frame; each later one adds the words its title has that the
 * first's lacks (`20-02 The plan on the web, AX5` → `20-02-ax5`), or a counter.
 */
export function screenLabels(fileSlug: string, labels: readonly string[]): (ScreenLabel | null)[] {
  const first = new Map<string, string[]>();
  const taken = new Set<string>();
  return labels.map((raw) => {
    const parsed = parseLabel(raw);
    if (!parsed) return null;
    const label = SCREEN_ID.test(parsed.id)
      ? parsed
      : { id: fileSlug, title: raw.replace(/\s+/g, ' ').trim() };
    const words = slugify(label.title).split('-').filter(Boolean);
    const seen = first.get(label.id);
    if (!seen) {
      first.set(label.id, words);
      taken.add(label.id);
      return label;
    }
    const extra = words.filter((w) => !seen.includes(w)).slice(0, 6);
    let id = extra.length > 0 ? `${label.id}-${extra.join('-')}` : `${label.id}-2`;
    for (let n = 2; taken.has(id); n++) id = `${label.id}-${n}`;
    taken.add(id);
    return { id, title: label.title };
  });
}

/** Lower-case ASCII slug: diacritics dropped (`đ` → `d`), runs of anything else become one dash. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A short slug for a title: its first `words` words (`Map of the project` → `map-of-the-project`). */
export function titleSlug(title: string, words = 6): string {
  return slugify(title).split('-').slice(0, words).join('-');
}

/** `17 Landing VI.dc.html` → `17-landing-vi`. */
export function fileSlug(fileName: string): string {
  return slugify(fileName.replace(/\.dc\.html$/, ''));
}

/** Frames up to this CSS width are phones (and phone-sized cards); wider ones are tablet, web or desktop. */
export const PHONE_MAX_WIDTH = 500;
export const PHONE_SCALE = 3;
export const WIDE_SCALE = 2;

/** Device scale for a frame: 3 for phone-sized frames (an iPhone's @3x), 2 for anything wider. */
export function scaleForWidth(cssWidth: number): number {
  return cssWidth <= PHONE_MAX_WIDTH ? PHONE_SCALE : WIDE_SCALE;
}

/** `<id>` → `<id>.png`; with a variant suffix `night` → `<id>.night.png`. */
export function renderFileName(id: string, suffix?: string): string {
  return suffix ? `${id}.${suffix}.png` : `${id}.png`;
}

/** Gives repeated slugs a counter (`intro`, `intro-2`) so section files never overwrite each other. */
export function uniqueSlugs(slugs: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return slugs.map((raw) => {
    const slug = raw || 'section';
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    return n === 1 ? slug : `${slug}-${n}`;
  });
}
