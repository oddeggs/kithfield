import {
  type EpochMs,
  type FarmEvent,
  isTombstone,
  type PersonId,
  type RuleRef,
} from '@kithfield/contracts';

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

/** Removes an event under a rule: `unsend {by: safety}`, and the target becomes a tombstone. */
export const removeEvent = (
  host: FarmHost,
  target: number,
  rule: RuleRef,
): Promise<SafetyOutcome> => {
  const event = host.store.event(target);
  if (event === null || event.actor === null || event.kind === 'settings_changed') {
    return Promise.resolve({ ok: false, reason: 'not_found' });
  }
  if (isTombstone(event.payload)) return Promise.resolve({ ok: false, reason: 'gone' });
  const written = host.farm.write(null, 'unsend', { target, by: 'safety' }, host.now(), () => {
    tombstoneEvent(host.store, target, 'removed', rule);
  });
  return done(host, written);
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

/**
 * Account deletion: a member leaves with `left {how: account_deleted}` and everything they wrote
 * becomes a tombstone; on a farm they only visited, their gate and trade events do. Their media is
 * deleted. Facts stay, so the farm grows the same.
 */
export const deleteAccount = async (host: FarmHost, person: PersonId): Promise<void> => {
  const media: string[] = [];
  if (isMember(host, person)) {
    const left = host.farm.write(
      person,
      'left',
      { how: 'account_deleted' },
      host.now(),
      (event) => {
        media.push(...tombstoneAuthor(host.store, person, event.seq));
      },
    );
    if (left !== null) {
      await done(host, left, media);
      return;
    }
  }
  host.ctx.storage.transactionSync(() => media.push(...tombstoneAuthor(host.store, person, 0)));
  if (media.length > 0) await host.env.MEDIA.delete(media);
};
