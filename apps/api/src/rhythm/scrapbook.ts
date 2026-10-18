import {
  type EventEnvelope,
  isTombstone,
  type ScrapbookPage,
  ScrapbookPagePayload,
  TombstoneFacts,
} from '@kithfield/contracts';

import type { FarmStore } from '../farm/store';

/*
 * The farm's scrapbook, read inside the farm object: pressed pages, newest first, each with the
 * events it keeps. A page any member hid stays hidden, even if the hide itself was later removed,
 * and a page that was unsent or removed (its payload a tombstone) is gone. An item that was unsent
 * since stays as its tombstone envelope, which the app draws as a gap.
 */

/** Pages in one answer. */
export const SCRAPBOOK_PAGE_SIZE = 20;
/** Scrapbook events read from the log at a time. */
const READ_BATCH = 500;

/** An envelope whose payload is typed as the object it is, so it crosses a Durable Object call. */
export type WireEnvelope = Omit<EventEnvelope, 'payload'> & { payload: object };
export type WireScrapbookPage = Omit<ScrapbookPage, 'items'> & { items: WireEnvelope[] };
export type WireScrapbook = { pages: WireScrapbookPage[]; more: boolean };

type Pressed = Extract<ScrapbookPagePayload, { action: 'pressed' }>;

/** Every scrapbook event in the log, oldest first. */
const scrapbookEvents = (store: FarmStore): EventEnvelope[] => {
  const all: EventEnvelope[] = [];
  let after = 0;
  for (;;) {
    const batch = store.after(after, READ_BATCH, ['scrapbook_page']);
    all.push(...batch);
    const last = batch.at(-1);
    if (last === undefined || batch.length < READ_BATCH) return all;
    after = last.seq;
  }
};

/** The page a hide points at, from its payload or what its tombstone kept. */
const hiddenTarget = (event: EventEnvelope): number | null => {
  if (isTombstone(event.payload)) {
    const facts = TombstoneFacts.safeParse(event.payload.facts ?? {});
    return facts.success && facts.data.action === 'hidden' ? (facts.data.target ?? null) : null;
  }
  const payload = ScrapbookPagePayload.safeParse(event.payload);
  return payload.success && payload.data.action === 'hidden' ? payload.data.target : null;
};

const pressedOf = (event: EventEnvelope): Pressed | null => {
  if (isTombstone(event.payload)) return null;
  const payload = ScrapbookPagePayload.safeParse(event.payload);
  return payload.success && payload.data.action === 'pressed' ? payload.data : null;
};

const pageOf = (store: FarmStore, event: EventEnvelope, pressed: Pressed): WireScrapbookPage => ({
  seq: event.seq,
  at: event.at,
  actor: event.actor,
  title: pressed.title,
  seed: pressed.seed ?? null,
  flower: pressed.flower ?? null,
  items: pressed.items.flatMap((seq) => {
    const item = store.event(seq);
    return item === null ? [] : [item as WireEnvelope];
  }),
});

/** The pressed pages before `before` (or the newest), newest first. */
export const scrapbookOf = (
  store: FarmStore,
  before: number | null,
  size = SCRAPBOOK_PAGE_SIZE,
): WireScrapbook => {
  const events = scrapbookEvents(store);
  const hidden = new Set(events.map(hiddenTarget).filter((t) => t !== null));
  const shown: { event: EventEnvelope; pressed: Pressed }[] = [];
  for (const event of [...events].reverse()) {
    if (before !== null && event.seq >= before) continue;
    if (hidden.has(event.seq)) continue;
    const pressed = pressedOf(event);
    if (pressed !== null) shown.push({ event, pressed });
  }
  return {
    pages: shown.slice(0, size).map(({ event, pressed }) => pageOf(store, event, pressed)),
    more: shown.length > size,
  };
};
