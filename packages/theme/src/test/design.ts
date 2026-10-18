import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The read-only design export at the repository root. */
const designDir = join(import.meta.dirname, '../../../../design');

export function readDesign(file: string): string {
  return readFileSync(join(designDir, file), 'utf8');
}

export const foundations = (): string => readDesign('01 Foundations.dc.html');

/** The part of `html` from the first `start` to the next `end` after it. */
export function between(html: string, start: string, end: string): string {
  const from = html.indexOf(start);
  if (from < 0) throw new Error(`design marker not found: ${start}`);
  const to = html.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`design marker not found: ${end}`);
  return html.slice(from, to);
}

/** Every match of `pattern` (which must be global) as its capture groups. */
export function captures(html: string, pattern: RegExp): string[][] {
  return [...html.matchAll(pattern)].map((m) => m.slice(1).map((g) => g ?? ''));
}

/** Visible text: tags dropped, entities the export uses decoded, whitespace collapsed. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The one match of `pattern` in `text`, or a failure naming what the design no longer says. */
export function one(text: string, pattern: RegExp): string[] {
  const m = pattern.exec(text);
  if (!m) throw new Error(`design text not found: ${pattern.source}`);
  return m.slice(1).map((g) => g ?? '');
}

export const num = (s: string): number => Number(s.replace('−', '-'));
