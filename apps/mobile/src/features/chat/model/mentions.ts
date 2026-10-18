import type { PersonId } from '@kithfield/contracts';

/*
 * @mentions: typing "@" opens the member list, filtered as you type, with dozing friends last.
 * A sent message names whom it mentions, and only they are nudged, once.
 */

export interface Mentionable {
  readonly person: PersonId;
  readonly name: string;
  /** Dozing, hibernating or napping: listed after everyone awake. */
  readonly dozing: boolean;
}

/** Folds case and Vietnamese marks, so "be" finds "Bé" and "Bea". */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** The "@word" being typed at the caret: where its "@" is and what follows it. */
export function mentionQuery(
  text: string,
  caret: number,
): { readonly start: number; readonly query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before.charAt(at - 1))) return null;
  const query = before.slice(at + 1);
  if (/[\s@]/.test(query) || query.length > 32) return null;
  return { start: at, query };
}

/** Members matching what's typed, best first: names that start with it, awake before dozing. */
export function rankMentions(
  members: readonly Mentionable[],
  query: string,
  me: PersonId | null,
): Mentionable[] {
  const q = fold(query);
  return members
    .filter((m) => m.person !== me && (q === '' || fold(m.name).includes(q)))
    .map((m, i) => ({ m, i, starts: fold(m.name).startsWith(q) }))
    .sort((a, b) => {
      if (a.m.dozing !== b.m.dozing) return a.m.dozing ? 1 : -1;
      if (a.starts !== b.starts) return a.starts ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ m }) => m);
}

/** Puts "@Name " in place of the "@word" being typed, and where the caret goes after it. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { readonly text: string; readonly caret: number } {
  const inserted = `@${name} `;
  const rest = text.slice(caret).replace(/^\S*/, '').replace(/^ /, '');
  return { text: text.slice(0, start) + inserted + rest, caret: start + inserted.length };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The pattern for "@Name" as a whole word. */
const mentionPattern = (name: string) =>
  new RegExp(`(^|\\s)@${escape(name)}(?=$|[\\s.,!?;:)'"’”])`, 'u');

/** Whom a message mentions: each member whose "@Name" is in it, once. */
export function mentionsIn(text: string, members: readonly Mentionable[]): PersonId[] {
  // Longer names first, so "@Bea Rose" wins over "@Bea".
  const byLength = [...members].sort((a, b) => b.name.length - a.name.length);
  const found: PersonId[] = [];
  let rest = text;
  for (const m of byLength) {
    const pattern = mentionPattern(m.name);
    if (pattern.test(rest)) {
      found.push(m.person);
      rest = rest.replace(pattern, '$1');
    }
  }
  return found;
}

export interface Segment {
  readonly text: string;
  readonly mention: boolean;
}

/** Splits text into plain runs and "@Name" runs for the names given, to draw mentions. */
export function segmentsOf(text: string, names: readonly string[]): Segment[] {
  const wanted = [...new Set(names.filter((n) => n !== ''))].sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return text === '' ? [] : [{ text, mention: false }];
  const pattern = new RegExp(`@(?:${wanted.map(escape).join('|')})(?=$|[\\s.,!?;:)'"’”])`, 'gu');
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at > 0 && !/\s/.test(text.charAt(at - 1))) continue;
    if (at > last) out.push({ text: text.slice(last, at), mention: false });
    out.push({ text: match[0], mention: true });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out;
}

/** The "@word" being typed, as a segment of its own, for the composer's highlight. */
export function draftSegments(text: string, names: readonly string[], caret: number): Segment[] {
  const query = mentionQuery(text, caret);
  if (!query) return segmentsOf(text, names);
  const end = query.start + 1 + query.query.length;
  return [
    ...segmentsOf(text.slice(0, query.start), names),
    { text: text.slice(query.start, end), mention: true },
    ...segmentsOf(text.slice(end), names),
  ];
}
