import {
  type DoorstepItem,
  type EpochMs,
  type EventOf,
  type FarmState,
  type LocalDate,
  type PersonId,
  isTombstone,
  LIMITS,
} from '@kithfield/contracts';

import { factsOf } from './growth';
import { memberOf, updateMember } from './members';
import { withoutSeed } from './plans';
import { isBirthday } from './time';

/* What waits on doorsteps, the cork board's pins, and birthday roses and cards. */

const MAX_DOORSTEP = 500;

const withItem = (state: FarmState, item: DoorstepItem): FarmState => ({
  ...state,
  doorstep: [...state.doorstep.filter((d) => d.seq !== item.seq), item].slice(-MAX_DOORSTEP),
});

/** A delivered slow post leaves the doorstep once the farm's clock passes its `deliverAt`. */
export const withoutDelivered = (state: FarmState, at: EpochMs): FarmState =>
  state.doorstep.some((d) => d.deliverAt !== undefined && d.deliverAt <= at)
    ? {
        ...state,
        doorstep: state.doorstep.filter((d) => !(d.deliverAt !== undefined && d.deliverAt <= at)),
      }
    : state;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Fireflies, gifts and slow posts left for someone, from members or through the gate. */
export const applyDoorstep = (
  state: FarmState,
  event: EventOf<'firefly' | 'gift' | 'slow_post' | 'gate'>,
): FarmState => {
  const facts = factsOf(event);
  const { seq, actor: from } = event;
  const to = text(facts['to']);
  const gift = text(facts['gift']);
  const action = facts['action'];
  if (from === null) return state;
  switch (event.kind) {
    case 'firefly':
      if (action === 'opened') {
        const opened = state.doorstep.filter((d) => !(d.seq === facts['target'] && d.to === from));
        // Opening a firefly wakes the critter it was left for.
        return updateMember({ ...state, doorstep: opened }, from, () => ({
          lastOpenedAt: event.at,
        }));
      }
      return to ? withItem(state, { seq, kind: 'firefly', from, to }) : state;
    case 'gift':
      if (action === 'opened') {
        return {
          ...state,
          doorstep: state.doorstep.filter((d) => !(d.gift === gift && d.to === from)),
        };
      }
      return to && gift ? withItem(state, { seq, kind: 'gift', from, to, gift }) : state;
    case 'slow_post':
      // An unsent slow post has no `deliverAt` left, and nothing to deliver.
      if (isTombstone(event.payload)) return state;
      return withItem(state, {
        seq,
        kind: 'slow_post',
        from,
        to: event.payload.to,
        deliverAt: event.payload.deliverAt,
      });
    case 'gate': {
      const visitor = isTombstone(event.payload) ? {} : { visitor: event.payload.visitor };
      if (to && action === 'firefly')
        return withItem(state, { seq, kind: 'firefly', from, to, ...visitor });
      if (to && gift && action === 'gift') {
        return withItem(state, { seq, kind: 'gift', from, to, gift, ...visitor });
      }
      return state;
    }
  }
};

export const applyPin = (state: FarmState, event: EventOf<'pin'>): FarmState => {
  const facts = factsOf(event);
  const target = facts['target'];
  if (typeof target !== 'number') return state;
  const others = state.pins.filter((p) => p !== target);
  // Up to ten; the oldest drops off.
  const pins = facts['on'] === true ? [...others, target].slice(-LIMITS.pins) : others;
  return { ...state, pins };
};

/** An unsend or a removal takes the target off the cork board, the doorstep and the plans. */
export const applyUnsend = (state: FarmState, event: EventOf<'unsend'>): FarmState => {
  const target = factsOf(event)['target'];
  if (typeof target !== 'number') return state;
  const next = {
    ...state,
    pins: state.pins.filter((p) => p !== target),
    doorstep: state.doorstep.filter((d) => d.seq !== target),
  };
  return withoutSeed(next, target);
};

const birthdayToday = (state: FarmState, person: PersonId, day: LocalDate): boolean => {
  const birthday = memberOf(state, person)?.birthday;
  return state.birthdaysBloom && !!birthday && isBirthday(birthday, day);
};

const withRose = (
  state: FarmState,
  person: PersonId,
  day: LocalDate,
  add: { waterer?: PersonId; signer?: PersonId },
): FarmState => {
  const current = state.roses.find((r) => r.person === person && r.day === day);
  const rose = current ?? { person, day, waterers: [], signers: [] };
  const join = (list: readonly PersonId[], who: PersonId | undefined) =>
    who && !list.includes(who) && list.length < LIMITS.members ? [...list, who] : [...list];
  const next = {
    ...rose,
    waterers: join(rose.waterers, add.waterer),
    signers: join(rose.signers, add.signer),
  };
  return { ...state, roses: [...state.roses.filter((r) => r.person !== person), next] };
};

/**
 * A dewdrop for someone on their birthday waters their rose. The rose finds no field guide page
 * here: the birthday it depends on is personal and leaves with a deleted account, so a device
 * catching up past one could not find the page the same way.
 */
export const applyRoseWater = (
  state: FarmState,
  event: EventOf<'dewdrop'>,
  day: LocalDate,
): FarmState => {
  const to = text(factsOf(event)['to']);
  if (!to || to === event.actor || !birthdayToday(state, to, day)) return state;
  return withRose(state, to, day, { waterer: event.actor });
};

/** A birthday card signed on the day. */
export const applyCardSigned = (
  state: FarmState,
  event: EventOf<'card_signed'>,
  day: LocalDate,
): FarmState => {
  const to = text(factsOf(event)['to']);
  if (!to || !memberOf(state, to)) return state;
  return withRose(state, to, day, { signer: event.actor });
};
