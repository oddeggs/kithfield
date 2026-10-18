import {
  type EventEnvelope,
  type EventKind,
  type FarmEvent,
  type FarmState,
  isTombstone,
  type PersonId,
} from '@kithfield/contracts';
import { STATUS_MS } from '@kithfield/farm';

import type { FarmStore } from './store';

/*
 * After a safety removal of a critter change, a status or a plan edit, the farm writes a follow-up
 * of the same kind on the person's behalf that puts back what was there before: the previous
 * critter, name and birthday; the previous status; the plan's previous title, days and place.
 * Later changes win: only what the removed event was the last word on is restored.
 */

export type FollowUp = { actor: PersonId; kind: EventKind; payload: Record<string, unknown> };

type Fields = Record<string, unknown>;

const live = (events: readonly EventEnvelope[], removed: number) =>
  events.filter((e) => e.seq !== removed && !isTombstone(e.payload));

const fieldsOf = (event: EventEnvelope | FarmEvent): Fields => event.payload as Fields;

/** Values as if the removed event had never been: each field's last word, oldest first. */
const replayFields = (events: readonly EventEnvelope[], keys: readonly string[]): Fields => {
  const out: Fields = {};
  for (const event of events) {
    for (const key of keys) {
      const value = fieldsOf(event)[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
};

/** Keys the removed event set that nothing later set again. */
const lastWordOn = (removed: FarmEvent, later: readonly EventEnvelope[], keys: readonly string[]) =>
  keys.filter(
    (key) =>
      fieldsOf(removed)[key] !== undefined && !later.some((e) => fieldsOf(e)[key] !== undefined),
  );

const critterFollowUp = (
  store: FarmStore,
  removed: FarmEvent,
  actor: PersonId,
): FollowUp | null => {
  const mine = live(store.byActor(actor), removed.seq);
  const history = mine.filter((e) => e.kind === 'joined' || e.kind === 'critter_changed');
  const later = history.filter((e) => e.seq > removed.seq);
  const keys = lastWordOn(removed, later, ['critter', 'name', 'birthday']);
  if (keys.length === 0) return null;
  const before = replayFields(
    history.filter((e) => e.seq < removed.seq),
    keys,
  );
  const payload: Fields = {};
  for (const key of keys) {
    if (before[key] !== undefined) payload[key] = before[key];
    else if (key === 'birthday') payload[key] = null;
  }
  return Object.keys(payload).length > 0 ? { actor, kind: 'critter_changed', payload } : null;
};

const statusFollowUp = (
  store: FarmStore,
  removed: FarmEvent,
  actor: PersonId,
  now: number,
): FollowUp | null => {
  const which = fieldsOf(removed)['status'];
  const same = live(store.byActor(actor), removed.seq).filter(
    (e) => e.kind === 'status' && fieldsOf(e)['status'] === which,
  );
  if (same.some((e) => e.seq > removed.seq)) return null;
  const before = same.filter((e) => e.seq < removed.seq).at(-1);
  if (which === 'words') {
    // The reducer clears the removed bubble; an earlier one comes back only if it would still show.
    const text =
      before === undefined || now - before.at >= STATUS_MS ? null : fieldsOf(before)['text'];
    return typeof text === 'string'
      ? { actor, kind: 'status', payload: { status: 'words', text } }
      : null;
  }
  if (which === 'cloud') {
    const raised = before === undefined ? false : fieldsOf(before)['raised'];
    return { actor, kind: 'status', payload: { status: 'cloud', raised } };
  }
  const battery = before === undefined ? 'open' : fieldsOf(before)['battery'];
  return { actor, kind: 'status', payload: { status: 'battery', battery } };
};

const PLAN_CONTENT = ['title', 'days', 'place'] as const;

const seedFollowUp = (store: FarmStore, removed: FarmEvent, actor: PersonId): FollowUp | null => {
  const seq = fieldsOf(removed)['seed'];
  if (typeof seq !== 'number') return null;
  const planted = store.event(seq);
  if (planted === null || planted.kind !== 'seed_planted' || isTombstone(planted.payload))
    return null;
  const changes = live(store.withField('seed_changed', 'seed', seq), removed.seq);
  const keys = lastWordOn(
    removed,
    changes.filter((e) => e.seq > removed.seq),
    PLAN_CONTENT,
  );
  if (keys.length === 0) return null;
  const before = replayFields([planted, ...changes.filter((e) => e.seq < removed.seq)], keys);
  return { actor, kind: 'seed_changed', payload: { seed: seq, ...before } };
};

/** The follow-up a safety removal of `removed` calls for, if any. */
export const followUpFor = (
  store: FarmStore,
  removed: FarmEvent,
  state: FarmState,
  now: number,
): FollowUp | null => {
  const actor = removed.actor;
  if (actor === null || isTombstone(removed.payload)) return null;
  if (removed.kind === 'seed_changed') return seedFollowUp(store, removed, actor);
  // A person's own critter and status matter only while they live here.
  if (!state.members.some((m) => m.person === actor)) return null;
  if (removed.kind === 'critter_changed') return critterFollowUp(store, removed, actor);
  if (removed.kind === 'status') return statusFollowUp(store, removed, actor, now);
  return null;
};
