import {
  type EpochMs,
  FarmEvent,
  isTombstone,
  type PersonId,
  type RuleRef,
} from '@kithfield/contracts';

import { forgetMedia } from '../media/deletion';
import { followUpFor } from './followups';
import type { FarmHost } from './host';
import { restoreEvent, tombstoneAuthor, tombstoneEvent } from './tombstones';

/*
 * What the safety team and account deletion ask of a farm. The safety team writes with a null
 * actor. A removed event's original is held back for an appeal; its media stays until then.
 */

export type SafetyOutcome = { ok: true; seq: number } | { ok: false; reason: 'not_found' | 'gone' };

const done = async (
  host: FarmHost,
  event: FarmEvent | null,
  media: string[] = [],
): Promise<SafetyOutcome> => {
  if (event === null) return { ok: false, reason: 'not_found' };
  host.publish([event]);
  await host.settle([event], media);
  return { ok: true, seq: event.seq };
};

/**
 * Removes an event under a rule: `unsend {by: safety}`, and the target becomes a tombstone. A
 * removed critter change, status or plan edit is followed by one restoring what came before.
 */
export const removeEvent = async (
  host: FarmHost,
  target: number,
  rule: RuleRef,
): Promise<SafetyOutcome> => {
  const envelope = host.store.event(target);
  if (envelope === null || envelope.actor === null || envelope.kind === 'settings_changed') {
    return { ok: false, reason: 'not_found' };
  }
  if (isTombstone(envelope.payload)) return { ok: false, reason: 'gone' };
  const original = FarmEvent.parse(envelope);
  const written = host.farm.write(null, 'unsend', { target, by: 'safety' }, host.now(), () => {
    tombstoneEvent(host.store, target, 'removed', host.now(), rule);
  });
  if (written === null) return { ok: false, reason: 'not_found' };
  const state = host.farm.state;
  const follow = state === null ? null : followUpFor(host.store, original, state, host.now());
  const restoring =
    follow === null ? null : host.farm.write(follow.actor, follow.kind, follow.payload, host.now());
  const events = restoring === null ? [written] : [written, restoring];
  host.publish(events);
  await host.settle(events);
  return { ok: true, seq: written.seq };
};

/** An appeal undid a removal: the held payload goes back and the farm writes `restored`. */
export const restore = (host: FarmHost, target: number): Promise<SafetyOutcome> => {
  const written = host.farm.write(null, 'restored', { target }, host.now(), () => {
    if (!restoreEvent(host.store, target)) throw new Error('Nothing is held for that event');
  });
  return done(host, written);
};

const isMember = (host: FarmHost, person: PersonId) =>
  host.farm.state?.members.some((m) => m.person === person) === true;

/** Removes a member, and with `removeMedia` their photos, video and voice notes too. */
export const removeMember = (
  host: FarmHost,
  person: PersonId,
  removeMedia: boolean,
): Promise<SafetyOutcome> => {
  if (!isMember(host, person)) return Promise.resolve({ ok: false, reason: 'not_found' });
  const media: string[] = [];
  const written = host.farm.write(
    null,
    'removed',
    { person, removeMedia, by: 'safety' },
    host.now(),
    host.effectsOf(media),
  );
  return done(host, written, media);
};

/** Pauses a person: they can read but not post, and their critter naps until `until`. */
export const pause = (
  host: FarmHost,
  person: PersonId,
  until: EpochMs | null,
): Promise<SafetyOutcome> => {
  if (!isMember(host, person)) return Promise.resolve({ ok: false, reason: 'not_found' });
  return done(
    host,
    host.farm.write(null, 'settings_changed', { setting: 'paused', person, until }, host.now()),
  );
};

export const freeze = (host: FarmHost, on: boolean): Promise<SafetyOutcome> =>
  done(host, host.farm.write(null, 'settings_changed', { setting: 'frozen', on }, host.now()));

/** Whether the person's account deletion already reached this farm: their last word is that `left`. */
const alreadyDeleted = (written: readonly { kind: string; payload: unknown }[]): boolean => {
  const last = written.at(-1);
  return (
    last?.kind === 'left' && (last.payload as { how?: unknown } | null)?.how === 'account_deleted'
  );
};

/**
 * Account deletion: the person leaves with `left {how: account_deleted}` and everything they wrote
 * here becomes a tombstone, their media deleted. On a farm they only visited, that is their gate
 * and trade events, and the `left` tells phones there to tombstone what they hold too. Facts stay,
 * so the farm grows the same. The media keys are owed in the same transaction as the `left`, so a
 * failed R2 delete throws and is finished by the next try. Safe to run again: a farm it already
 * reached writes nothing more.
 */
export const deleteAccount = async (host: FarmHost, person: PersonId): Promise<void> => {
  const written = host.store.byActor(person);
  const traces = written.length + host.store.tradesWith(person).length;
  if (isMember(host, person) || (traces > 0 && !alreadyDeleted(written))) {
    const left = host.farm.write(person, 'left', { how: 'account_deleted' }, host.now(), (e) => {
      host.store.oweMediaDelete(tombstoneAuthor(host.store, person, e.seq));
    });
    await done(host, left);
  }
  await deleteOwedMedia(host);
};

/**
 * Deletes the media an account deletion owes R2, in the order it was owed. Throws when R2 fails,
 * so the deletion is tried again; what was deleted is no longer owed.
 */
const deleteOwedMedia = async (host: FarmHost): Promise<void> => {
  for (let keys = host.store.mediaOwed(); keys.length > 0; keys = host.store.mediaOwed()) {
    await host.env.MEDIA.delete(keys);
    await forgetMedia(host.env.DB, keys);
    host.store.mediaDeleted(keys);
  }
};
