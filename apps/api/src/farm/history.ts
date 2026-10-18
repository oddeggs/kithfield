import {
  type EventEnvelope,
  type EventsPage,
  type EventsQuery,
  LIMITS,
  type SearchResults,
} from '@kithfield/contracts';

import type { FarmStore } from './store';

/** An `EventsPage` whose payloads are typed as the objects they are, so it crosses a Durable Object call. */
export type WirePage = Omit<EventsPage, 'events'> & {
  events: (Omit<EventEnvelope, 'payload'> & { payload: object })[];
};

/** History paging: after a seq, before one, between both, or the newest page. Oldest first. */
export const pageEvents = (store: FarmStore, query: EventsQuery): WirePage => {
  const { after, before, limit, kinds } = query;
  if (after !== undefined) {
    const rows = store.after(after, limit + 1, kinds, before);
    return { events: rows.slice(0, limit), more: rows.length > limit } as WirePage;
  }
  const rows = store.before(before ?? null, limit + 1, kinds);
  return { events: rows.slice(-limit), more: rows.length > limit } as WirePage;
};

/** FTS5 query text: every word as a quoted prefix, all of them required. */
export const matchOf = (q: string): string | null => {
  const words = q.split(/\s+/).filter((w) => w !== '');
  return words.length === 0 ? null : words.map((w) => `"${w.replaceAll('"', '""')}"*`).join(' ');
};

const SNIPPET_MAX = 300;

/** Full-text search inside the farm, newest first. */
export const searchEvents = (store: FarmStore, q: string): SearchResults => {
  const match = matchOf(q);
  if (match === null) return { results: [] };
  const results = store
    .search(match, LIMITS.eventsBatch / 2)
    .map((hit) => ({ ...hit, snippet: hit.snippet.trim().slice(0, SNIPPET_MAX) }))
    .filter((hit) => /\S/.test(hit.snippet));
  return { results };
};
