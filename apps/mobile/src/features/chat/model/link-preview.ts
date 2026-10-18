import { siteOf } from './media';

/*
 * Link previews are fetched on the sender's phone, never by the server: the title, a line
 * of description and the site, read from the page's Open Graph tags or its title.
 */

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'“”‘’]+/i;

/** The first web address in a message, without trailing punctuation. */
export function firstUrl(text: string): string | null {
  const match = URL_PATTERN.exec(text);
  if (!match) return null;
  return match[0].replace(/[.,!?;:)\]]+$/, '');
}

export interface Preview {
  readonly title?: string;
  readonly description?: string;
  readonly site?: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function meta(html: string, names: readonly string[]): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!key || !names.includes(key)) continue;
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (value && value.trim() !== '') return decode(value);
  }
  return undefined;
}

const clip = (text: string | undefined, max: number) =>
  text === undefined || text === '' ? undefined : Array.from(text).slice(0, max).join('');

/** A page's preview from its HTML head. */
export function parsePreview(html: string, url: string): Preview {
  const head = html.slice(0, 200_000);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title =
    meta(head, ['og:title', 'twitter:title']) ?? (titleTag ? decode(titleTag) : undefined);
  const description = meta(head, ['og:description', 'twitter:description', 'description']);
  const site = meta(head, ['og:site_name']) ?? siteOf(url);
  const t = clip(title, 200);
  const d = clip(description, 500);
  const s = clip(site, 100);
  return {
    ...(t ? { title: t } : {}),
    ...(d ? { description: d } : {}),
    ...(s ? { site: s } : {}),
  };
}

/** Fetches a page's preview, giving up after a few seconds; null when there is none. */
export async function fetchPreview(url: string, timeoutMs = 4000): Promise<Preview | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: abort.signal,
      headers: { accept: 'text/html' },
      credentials: 'omit',
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('html')) return null;
    const preview = parsePreview(await response.text(), url);
    return preview.title ? preview : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
