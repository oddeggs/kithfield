import {
  type EpochMs,
  type EventOf,
  type FarmState,
  type PersonId,
  type SeedState,
  type Seq,
  isTombstone,
  LIMITS,
} from '@kithfield/contracts';

import { factsOf } from './growth';
import { HANGOUT_PEOPLE } from './rules';

/* Plan seeds: planting, changes, votes on days, RSVPs and check-ins at the hangout. */

/**
 * The title of a plan whose planting reached this device already unsent. Its content is gone, but
 * the votes, RSVPs and check-ins on it still count until its unsend (or its planter's departure)
 * removes it, so a device catching up grows the farm exactly as one that saw it live. Never drawn.
 */
export const UNSENT_PLAN_TITLE = '⁣';

export const isUnsentPlan = (seed: SeedState): boolean => seed.title === UNSENT_PLAN_TITLE;

const MAX_SEEDS = 100;

export interface PlanConditions {
  readonly day: boolean;
  readonly place: boolean;
  readonly yeses: boolean;
}

/** How many "in" answers a plan needs, by its `yeses` and the farm's size. */
export const yesesNeeded = (yeses: SeedState['yeses'], members: number): number => {
  switch (yeses) {
    case 'couple':
      return 2;
    case 'most':
      return Math.floor(members / 2) + 1;
    case 'everyone':
      return Math.max(members, 2);
  }
};

/** A plan grows a stage per condition met: a day, a place and enough yeses. */
export const planConditions = (seed: SeedState, members: number): PlanConditions => ({
  day: seed.settleOn !== null || seed.days.length === 1,
  place: seed.place !== null,
  yeses: seed.rsvps.filter((r) => r.answer === 'in').length >= yesesNeeded(seed.yeses, members),
});

const withSprout = (state: FarmState, seed: SeedState, at: EpochMs): SeedState => {
  if (seed.sproutedAt !== null || seed.someday || isUnsentPlan(seed)) return seed;
  const c = planConditions(seed, state.members.length);
  return c.day && c.place && c.yeses ? { ...seed, sproutedAt: at } : seed;
};

const updateSeed = (
  state: FarmState,
  seq: unknown,
  at: EpochMs,
  change: (seed: SeedState) => SeedState,
): FarmState => {
  if (!state.seeds.some((s) => s.seq === seq)) return state;
  return {
    ...state,
    seeds: state.seeds.map((s) => (s.seq === seq ? withSprout(state, change(s), at) : s)),
  };
};

export const seedOf = (state: FarmState, seq: Seq): SeedState | undefined =>
  state.seeds.find((s) => s.seq === seq);

export const applySeedPlanted = (state: FarmState, event: EventOf<'seed_planted'>): FarmState => {
  const { seq, actor, at, payload } = event;
  const plan = isTombstone(payload)
    ? { title: UNSENT_PLAN_TITLE, days: [], place: null, yeses: 'couple' as const, someday: false }
    : {
        title: payload.title,
        days: payload.days,
        place: payload.place,
        yeses: payload.yeses,
        someday: payload.someday,
      };
  const seed: SeedState = {
    seq,
    planter: actor,
    ...plan,
    hat: actor,
    settleOn: null,
    votes: [],
    rsvps: [],
    checkins: [],
    sproutedAt: null,
  };
  const seeds = [...state.seeds.filter((s) => s.seq !== seq), withSprout(state, seed, at)];
  return { ...state, seeds: seeds.slice(-MAX_SEEDS) };
};

export const applySeedChanged = (state: FarmState, event: EventOf<'seed_changed'>): FarmState => {
  const p = event.payload;
  const facts = factsOf(event);
  return updateSeed(state, facts['seed'], event.at, (seed) => {
    const hat = typeof facts['hat'] === 'string' ? { hat: facts['hat'] } : {};
    if (isTombstone(p) || isUnsentPlan(seed)) return { ...seed, ...hat };
    return {
      ...seed,
      ...hat,
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.days !== undefined ? { days: p.days } : {}),
      ...(p.place !== undefined ? { place: p.place } : {}),
      ...(p.yeses !== undefined ? { yeses: p.yeses } : {}),
      ...(p.someday !== undefined ? { someday: p.someday } : {}),
      ...(p.settleOn !== undefined ? { settleOn: p.settleOn } : {}),
    };
  });
};

export const applyVote = (state: FarmState, event: EventOf<'vote'>): FarmState => {
  const facts = factsOf(event);
  const { actor } = event;
  const option = facts['option'];
  if (typeof option !== 'number') return state;
  return updateSeed(state, facts['seed'], event.at, (seed) => {
    const others = seed.votes.filter((v) => v.option !== option);
    const people = (seed.votes.find((v) => v.option === option)?.people ?? []).filter(
      (p) => p !== actor,
    );
    const on = facts['on'] === true && people.length < LIMITS.members;
    const next = on ? [...people, actor] : people;
    const votes = next.length > 0 ? [...others, { option, people: next }] : others;
    return { ...seed, votes: votes.sort((a, b) => a.option - b.option) };
  });
};

export const applyRsvp = (state: FarmState, event: EventOf<'rsvp'>): FarmState => {
  const facts = factsOf(event);
  const answer = facts['answer'];
  if (answer !== 'in' && answer !== 'maybe' && answer !== 'out') return state;
  return updateSeed(state, facts['seed'], event.at, (seed) => {
    const rsvps = seed.rsvps.filter((r) => r.person !== event.actor);
    if (rsvps.length >= LIMITS.members) return seed;
    return { ...seed, rsvps: [...rsvps, { person: event.actor, answer }] };
  });
};

/**
 * Someone is at the hangout. Returns who the hangout now grows: once two people are there,
 * everyone there; after that, each new arrival.
 */
export const applyCheckin = (
  state: FarmState,
  event: EventOf<'checkin'>,
): { state: FarmState; hangout: readonly PersonId[] } => {
  const seq = factsOf(event)['seed'];
  const seed = state.seeds.find((s) => s.seq === seq);
  if (!seed || seed.checkins.includes(event.actor) || seed.checkins.length >= LIMITS.members) {
    return { state, hangout: [] };
  }
  const checkins = [...seed.checkins, event.actor];
  const next = updateSeed(state, seq, event.at, (s) => ({ ...s, checkins }));
  if (checkins.length < HANGOUT_PEOPLE) return { state: next, hangout: [] };
  return { state: next, hangout: checkins.length === HANGOUT_PEOPLE ? checkins : [event.actor] };
};

/** An unsent or removed plan goes, with its votes and answers. */
export const withoutSeed = (state: FarmState, seq: unknown): FarmState =>
  state.seeds.some((s) => s.seq === seq)
    ? { ...state, seeds: state.seeds.filter((s) => s.seq !== seq) }
    : state;
