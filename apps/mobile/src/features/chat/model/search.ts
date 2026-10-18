import { isTombstone, type PersonId } from '@kithfield/contracts';

import { fold } from './mentions';
import type { LogEvent } from './timeline';

/*
 * Search (04-11): the farm's own full-text search on the server, merged with what this phone
 * holds, so it answers offline too and finds what was just sent. Messages, photos, links and
 * voice notes; filtered by person and farm.
 */

export type SearchTab = 'messages' | 'photos' | 'links' | 'voice';

export interface Hit {
  readonly farm: string;
  readonly seq: number;
  readonly at: number;
  readonly actor: PersonId | null;
  /** The event kind the hit is (a message, a photo, a link…). */
  readonly kind: string;
  readonly text: string;
}

/** Which tab an event kind shows under; null for kinds search doesn't list. */
export function tabOf(kind: string): SearchTab | null {
  switch (kind) {
    case 'message':
    case 'quiet_note':
    case 'slow_post':
    case 'seed_planted':
      return 'messages';
    case 'media':
      return 'photos';
    case 'link':
      return 'links';
    case 'voice':
      return 'voice';
    default:
      return null;
  }
}

const obj = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** The words an event can be found by on this phone. */
export function wordsOf(event: LogEvent): string | null {
  if (isTombstone(event.payload)) return null;
  const p = obj(event.payload);
  switch (event.kind) {
    case 'message':
    case 'quiet_note':
      return str(p['text']) ?? null;
    case 'link': {
      const preview = obj(p['preview']);
      const words = [str(p['text']), str(preview['title']), str(p['url'])].filter(Boolean);
      return words.length > 0 ? words.join(' ') : null;
    }
    case 'media':
      return str(p['caption']) ?? null;
    case 'voice':
      return str(p['transcript']) ?? null;
    case 'seed_planted':
      return str(p['title']) ?? null;
    default:
      return null;
  }
}

/** The query's words, folded; every one must start a word of the text. */
export const queryWords = (query: string): string[] =>
  fold(query)
    .split(/\s+/)
    .filter((w) => w !== '');

/** Whether every word of the query starts a word of the text, as the farm's search matches. */
export function matches(text: string, words: readonly string[]): boolean {
  const folded = fold(text);
  const tokens = folded.split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '');
  return words.every((w) => tokens.some((t) => t.startsWith(w)));
}

/** Hits among the events this phone holds: edits applied, unsent messages left out. */
export function localHits(farm: string, events: readonly LogEvent[], query: string): Hit[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const edits = new Map<number, string>();
  const gone = new Set<number>();
  for (const e of events) {
    if (isTombstone(e.payload)) continue;
    const p = obj(e.payload);
    const target = p['target'];
    if (typeof target !== 'number') continue;
    if (e.kind === 'edit' && typeof p['text'] === 'string') edits.set(target, p['text']);
    if (e.kind === 'unsend') gone.add(target);
  }
  const hits: Hit[] = [];
  for (const e of events) {
    if (!e.known || gone.has(e.seq) || tabOf(e.kind) === null) continue;
    const text = edits.get(e.seq) ?? wordsOf(e);
    if (text === null || !matches(text, words)) continue;
    hits.push({ farm, seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, text });
  }
  return hits;
}

/** `farm:seq` of every message this phone knows was unsent or taken down. */
export function goneIn(farm: string, events: readonly LogEvent[]): Set<string> {
  const gone = new Set<string>();
  for (const e of events) {
    if (isTombstone(e.payload)) {
      gone.add(`${farm}:${e.seq}`);
      continue;
    }
    const target = obj(e.payload)['target'];
    if (e.kind === 'unsend' && typeof target === 'number') gone.add(`${farm}:${target}`);
  }
  return gone;
}

/**
 * The server's hits and this phone's, once each, newest first. The phone's words win (edits), and
 * a hit for something this phone knows is gone is dropped (the server may not have caught up).
 */
export function mergeHits(
  server: readonly Hit[],
  local: readonly Hit[],
  gone: ReadonlySet<string> = new Set(),
): Hit[] {
  const byKey = new Map<string, Hit>();
  for (const h of server) if (!gone.has(`${h.farm}:${h.seq}`)) byKey.set(`${h.farm}:${h.seq}`, h);
  for (const h of local) byKey.set(`${h.farm}:${h.seq}`, h);
  return [...byKey.values()].sort((a, b) => b.at - a.at || b.seq - a.seq);
}

export interface HitFilter {
  readonly person: PersonId | null;
}

/** Hits by tab, from one person or anyone. */
export function filterHits(hits: readonly Hit[], tab: SearchTab, filter: HitFilter): Hit[] {
  return hits.filter(
    (h) => tabOf(h.kind) === tab && (filter.person === null || h.actor === filter.person),
  );
}

export interface Mark {
  readonly text: string;
  readonly hit: boolean;
}

/** Splits text into runs, marking where a query word starts a word. */
export function highlight(text: string, query: string): Mark[] {
  const words = queryWords(query);
  if (words.length === 0 || text === '') return text === '' ? [] : [{ text, hit: false }];
  // Folding keeps one character per character for Latin and Vietnamese text, so offsets line up.
  const folded = fold(text);
  const marks: Mark[] = [];
  const ranges: [number, number][] = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(w, from);
      if (at < 0) break;
      const startsWord = at === 0 || /[^\p{L}\p{N}]/u.test(folded.charAt(at - 1));
      if (startsWord) {
        // Mark the whole word the query begins.
        let end = at + w.length;
        while (end < folded.length && /[\p{L}\p{N}]/u.test(folded.charAt(end))) end += 1;
        ranges.push([at, end]);
      }
      from = at + w.length;
    }
  }
  if (folded.length !== text.length || ranges.length === 0) return [{ text, hit: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  let last = 0;
  for (const [start, end] of ranges) {
    if (end <= last) continue;
    const s = Math.max(start, last);
    if (s > last) marks.push({ text: text.slice(last, s), hit: false });
    marks.push({ text: text.slice(s, end), hit: true });
    last = end;
  }
  if (last < text.length) marks.push({ text: text.slice(last), hit: false });
  return marks;
}
