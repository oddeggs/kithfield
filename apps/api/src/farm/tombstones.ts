import {
  FarmEvent,
  isTombstone,
  type PersonId,
  type RuleRef,
  type Tombstone,
  tombstoneOf,
} from '@kithfield/contracts';

import { mediaKeys, searchText } from './content';
import type { FarmStore } from './store';

/*
 * Replacing payloads with tombstones. The event keeps its seq, kind, actor and time; the tombstone
 * keeps the facts the reducer reads (`TOMBSTONE_KEEPS`), never content. The farm's own events and
 * settings are never tombstoned. A safety removal holds the original back so an appeal can restore
 * it; an unsend or an account deletion does not.
 */

type Why = Tombstone['tombstone'];

const tombstoneOne = (
  store: FarmStore,
  seq: number,
  why: Why,
  rule: RuleRef | undefined,
  holdAt: number | null,
): string[] => {
  const envelope = store.event(seq);
  if (envelope === null || isTombstone(envelope.payload)) return [];
  const event = FarmEvent.parse(envelope);
  if (event.kind === 'settings_changed' || event.actor === null) return [];
  if (holdAt !== null) store.hold(seq, event.payload, holdAt);
  store.replacePayload(seq, tombstoneOf(event, why, rule));
  store.unindex(seq);
  return mediaKeys(event);
};

/**
 * Tombstones an event and the edits made to it. Returns the media keys it pointed at, for the
 * caller to delete (or keep, while a removal can still be appealed).
 */
export const tombstoneEvent = (
  store: FarmStore,
  seq: number,
  why: Why,
  at: number,
  rule?: RuleRef,
): string[] => {
  const hold = why === 'removed' ? at : null;
  const keys = tombstoneOne(store, seq, why, rule, hold);
  for (const edit of store.pointingAt('edit', seq))
    keys.push(...tombstoneOne(store, edit.seq, why, rule, hold));
  return keys;
};

/**
 * Tombstones everything a person wrote here under any of their ids, apart from `keep`, and the
 * trades a member made here with them as a visitor (which name them). Returns their media keys.
 */
export const tombstoneAuthor = (store: FarmStore, person: PersonId, keep: number): string[] =>
  [...store.byActor(person), ...store.tradesWith(person)]
    .filter((event) => event.seq !== keep)
    .flatMap((event) => tombstoneOne(store, event.seq, 'author_deleted', undefined, null));

/** Tombstones a person's photos, video, voice notes and files (a removal with `removeMedia`). */
export const tombstoneMediaOf = (store: FarmStore, person: PersonId): string[] =>
  store
    .byActor(person)
    .filter((event) => event.kind === 'media' || event.kind === 'voice')
    .flatMap((event) => tombstoneOne(store, event.seq, 'removed', undefined, null));

/** Puts held payloads back (the target and its edits) and reindexes them. False if nothing was held. */
export const restoreEvent = (store: FarmStore, seq: number): boolean => {
  const payload = store.release(seq);
  if (payload === undefined) return false;
  const restore = (at: number, original: unknown) => {
    store.replacePayload(at, original);
    const event = FarmEvent.safeParse(store.event(at));
    const words = event.success ? searchText(event.data) : null;
    if (words !== null) store.index(seq, words);
  };
  restore(seq, payload);
  for (const edit of store.pointingAt('edit', seq)) {
    const held = store.release(edit.seq);
    if (held !== undefined) restore(edit.seq, held);
  }
  return true;
};
