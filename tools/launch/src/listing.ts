import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STORE_DIR } from './paths';

export interface ListingField {
  /** The heading, without its limit. */
  field: string;
  limit: number;
  text: string;
}

/** How the stores count: characters as people read them (composed, so a Vietnamese letter and its marks are one). */
export function storeLength(text: string): number {
  return [...text.normalize('NFC')].length;
}

/** A field that points at another instead of repeating it. */
const SAME_AS = /^The App Store description above, unchanged\.$/;

/**
 * The fields of a listing file: each `### <field> (<limit>)` heading and the text under it, up to
 * the next heading. A field written as "the App Store description above" takes that text.
 */
export function parseListing(markdown: string): ListingField[] {
  const fields: ListingField[] = [];
  const parts = markdown.split(/^### (.+)$/m);
  let description = '';
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i] ?? '';
    const body = (parts[i + 1] ?? '').split(/^## /m)[0]?.trim() ?? '';
    const limit = /\((\d+)\)$/.exec(heading);
    if (!limit?.[1]) continue;
    const field = heading.slice(0, limit.index).trim();
    const text = SAME_AS.test(body) ? description : body;
    if (field === 'Description') description = text;
    fields.push({ field, limit: Number(limit[1]), text });
  }
  return fields;
}

export function readListing(language: 'en' | 'vi'): ListingField[] {
  return parseListing(readFileSync(join(STORE_DIR, `listing.${language}.md`), 'utf8'));
}
