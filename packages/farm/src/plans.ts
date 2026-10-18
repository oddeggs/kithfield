import {
  type EpochMs,
  type EventOf,
  type FarmEvent,
  type FarmState,
  type LocalDate,
  type PersonId,
  type SeedState,
  type Seq,
  isTombstone,
  LIMITS,
} from '@kithfield/contracts';

import { factsOf } from './growth';
import { HANGOUT_PEOPLE, PLAN_DAY_RULES_VERSION, PLAN_FACTS_RULES_VERSION } from './rules';

/* Plan seeds: planting, changes, votes on days, RSVPs and check-ins at the hangout. */

/**
 * A plan whose planting was unsent or removed, perhaps before this device saw it. Its content is
 * gone and it is never drawn, but the votes, RSVPs and check-ins on it stay, so a device catching
 * up grows the farm exactly as one that saw it live.
 */
export const asUnsent = ({ placed: _placed, ...seed }: SeedState): SeedState => ({
  ...seed,
  unsent: true,
  title: null,
  days: [],
  place: null,
  yeses: 'couple',
  someday: false,
  settleOn: null,
  sproutedAt: null,
});

const MAX_SEEDS = 100;

const isYeses = (value: unknown): value is SeedState['yeses'] =>
  value === 'couple' || value === 'most' || value === 'everyone';

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

/**
 * When a plan event happens, as the plan rules read it: its time, the farm day it counts on, and
 * the rules version it was written under (the plan-day rules start at `PLAN_DAY_RULES_VERSION`).
 */
export interface PlanClock {
  readonly at: EpochMs;
  readonly day: LocalDate;
  readonly rulesVersion: number;
}

const planDayRules = (clock: PlanClock): boolean => clock.rulesVersion >= PLAN_DAY_RULES_VERSION;

/** The day options the most people lean on, by index, earliest first. None before any vote. */
export const leadingOptions = (seed: SeedState): number[] => {
  const counts = seed.days.map(
    (_, i) => seed.votes.find((v) => v.option === i)?.people.length ?? 0,
  );
  const most = Math.max(0, ...counts);
  if (most === 0) return [];
  return counts.flatMap((count, i) => (count === most ? [i] : []));
};

/**
 * The plan's day, once it has one: its only day option, or, once a settling day is set, the option
 * the most people lean on (the earliest of a tie; the first option if nobody leaned). Null while
 * friends are still picking. Votes and day changes stop once the plan sprouts, so a sprouted
 * plan's day stays put.
 */
export const planDay = (seed: SeedState): LocalDate | null => {
  if (seed.days.length === 1) return seed.days[0]?.date ?? null;
  if (seed.settleOn === null) return null;
  return seed.days[leadingOptions(seed)[0] ?? 0]?.date ?? null;
};

/**
 * A plan grows a stage per condition met: a day, a place and enough yeses. The day is met by a
 * single day option, or by a settling day once `today` (the farm's day) has reached it. Without
 * `today`, a settling day counts as soon as it is set, as the rules before the plan-day rules had
 * it.
 */
export const planConditions = (
  seed: SeedState,
  members: number,
  today?: LocalDate,
): PlanConditions => ({
  day:
    seed.days.length === 1 ||
    (seed.settleOn !== null && (today === undefined || today >= seed.settleOn)),
  // A plan rebuilt from its tombstoned planting knows only that it had a place.
  place: seed.place !== null || seed.placed === true,
  yeses: seed.rsvps.filter((r) => r.answer === 'in').length >= yesesNeeded(seed.yeses, members),
});

/** A plan with no content that can still sprout: rebuilt from its planting's tombstone. */
const contentless = (seed: SeedState): boolean => seed.unsent && seed.placed !== undefined;

const withSprout = (state: FarmState, seed: SeedState, clock: PlanClock): SeedState => {
  if (seed.sproutedAt !== null || seed.someday || (seed.unsent && !contentless(seed))) return seed;
  const today = planDayRules(clock) ? clock.day : undefined;
  const c = planConditions(seed, state.members.length, today);
  return c.day && c.place && c.yeses ? { ...seed, sproutedAt: clock.at } : seed;
};

const updateSeed = (
  state: FarmState,
  seq: unknown,
  clock: PlanClock,
  change: (seed: SeedState) => SeedState,
): FarmState => {
  if (!state.seeds.some((s) => s.seq === seq)) return state;
  return {
    ...state,
    seeds: state.seeds.map((s) => (s.seq === seq ? withSprout(state, change(s), clock) : s)),
  };
};

/**
 * The farm has reached a new day: plans whose settling day has come sprout now if everything else
 * is there, without waiting for someone to touch them.
 */
export const sproutSettled = (state: FarmState, clock: PlanClock): FarmState => {
  if (!planDayRules(clock)) return state;
  const due = (s: SeedState) =>
    s.sproutedAt === null && s.settleOn !== null && s.settleOn <= clock.day;
  if (!state.seeds.some(due)) return state;
  return { ...state, seeds: state.seeds.map((s) => (due(s) ? withSprout(state, s, clock) : s)) };
};

const clockOf = (event: FarmEvent, day: LocalDate): PlanClock => ({
  at: event.at,
  day,
  rulesVersion: event.rulesVersion,
});

export const seedOf = (state: FarmState, seq: Seq): SeedState | undefined =>
  state.seeds.find((s) => s.seq === seq);

export const applySeedPlanted = (
  state: FarmState,
  event: EventOf<'seed_planted'>,
  day: LocalDate,
): FarmState => {
  const { seq, actor, payload } = event;
  // A planting that arrives tombstoned is an unsent plan from the start.
  const unsent: SeedState = {
    seq,
    planter: actor,
    unsent: true,
    title: null,
    days: [],
    place: null,
    yeses: 'couple',
    someday: false,
    hat: actor,
    settleOn: null,
    votes: [],
    rsvps: [],
    checkins: [],
    sproutedAt: null,
  };
  const facts = factsOf(event);
  const dates = facts['days'];
  // From the plan-facts rules, a tombstoned planting still sprouts from what its tombstone kept.
  const rebuilt =
    isTombstone(payload) &&
    event.rulesVersion >= PLAN_FACTS_RULES_VERSION &&
    Array.isArray(dates) &&
    typeof facts['placed'] === 'boolean'
      ? {
          ...unsent,
          days: dates.filter((d): d is string => typeof d === 'string').map((date) => ({ date })),
          yeses: isYeses(facts['yeses']) ? facts['yeses'] : unsent.yeses,
          someday: facts['someday'] === true,
          placed: facts['placed'],
        }
      : unsent;
  const seed: SeedState = isTombstone(payload)
    ? rebuilt
    : {
        ...unsent,
        unsent: false,
        title: payload.title,
        days: payload.days,
        place: payload.place,
        yeses: payload.yeses,
        someday: payload.someday,
      };
  const seeds = [
    ...state.seeds.filter((s) => s.seq !== seq),
    withSprout(state, seed, clockOf(event, day)),
  ];
  return { ...state, seeds: seeds.slice(-MAX_SEEDS) };
};

export const applySeedChanged = (
  state: FarmState,
  event: EventOf<'seed_changed'>,
  day: LocalDate,
): FarmState => {
  const p = event.payload;
  const facts = factsOf(event);
  const clock = clockOf(event, day);
  return updateSeed(state, facts['seed'], clock, (seed) => {
    const hat = typeof facts['hat'] === 'string' ? { hat: facts['hat'] } : {};
    if (isTombstone(p)) return { ...seed, ...hat };
    if (seed.unsent) {
      if (!contentless(seed)) return { ...seed, ...hat };
      // A plan without content takes an edit's sprouting facts, never its words or place.
      const dayFixed = planDayRules(clock) && seed.sproutedAt !== null;
      return {
        ...seed,
        ...hat,
        ...(p.days !== undefined && !dayFixed
          ? { days: p.days.map((d) => ({ date: d.date })) }
          : {}),
        ...(p.place !== undefined ? { placed: p.place !== null } : {}),
        ...(p.yeses !== undefined ? { yeses: p.yeses } : {}),
        ...(p.someday !== undefined ? { someday: p.someday } : {}),
        ...(p.settleOn !== undefined && !dayFixed ? { settleOn: p.settleOn } : {}),
      };
    }
    // A sprouted plan keeps its day.
    const dayFixed = planDayRules(clock) && seed.sproutedAt !== null;
    return {
      ...seed,
      ...hat,
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.days !== undefined && !dayFixed ? { days: p.days } : {}),
      ...(p.place !== undefined ? { place: p.place } : {}),
      ...(p.yeses !== undefined ? { yeses: p.yeses } : {}),
      ...(p.someday !== undefined ? { someday: p.someday } : {}),
      ...(p.settleOn !== undefined && !dayFixed ? { settleOn: p.settleOn } : {}),
    };
  });
};

export const applyVote = (state: FarmState, event: EventOf<'vote'>, day: LocalDate): FarmState => {
  const facts = factsOf(event);
  const { actor } = event;
  const option = facts['option'];
  if (typeof option !== 'number') return state;
  const clock = clockOf(event, day);
  return updateSeed(state, facts['seed'], clock, (seed) => {
    // Leaning on a day would move a sprouted plan's day.
    if (planDayRules(clock) && seed.sproutedAt !== null) return seed;
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

export const applyRsvp = (state: FarmState, event: EventOf<'rsvp'>, day: LocalDate): FarmState => {
  const facts = factsOf(event);
  const answer = facts['answer'];
  if (answer !== 'in' && answer !== 'maybe' && answer !== 'out') return state;
  return updateSeed(state, facts['seed'], clockOf(event, day), (seed) => {
    const rsvps = seed.rsvps.filter((r) => r.person !== event.actor);
    if (rsvps.length >= LIMITS.members) return seed;
    return { ...seed, rsvps: [...rsvps, { person: event.actor, answer }] };
  });
};

/** Whether a check-in on `day` counts: the plan has sprouted and `day` is its day. */
export const isHangoutDay = (seed: SeedState, day: LocalDate): boolean =>
  seed.sproutedAt !== null && planDay(seed) === day;

/**
 * Someone is at the hangout. Returns who the hangout now grows: once two people are there,
 * everyone there; after that, each new arrival. A check-in on any other day than a sprouted
 * plan's own grows nothing.
 */
export const applyCheckin = (
  state: FarmState,
  event: EventOf<'checkin'>,
  day: LocalDate,
): { state: FarmState; hangout: readonly PersonId[] } => {
  const seq = factsOf(event)['seed'];
  const seed = state.seeds.find((s) => s.seq === seq);
  const clock = clockOf(event, day);
  if (
    !seed ||
    (planDayRules(clock) && !isHangoutDay(seed, day)) ||
    seed.checkins.includes(event.actor) ||
    seed.checkins.length >= LIMITS.members
  ) {
    return { state, hangout: [] };
  }
  const checkins = [...seed.checkins, event.actor];
  const next = updateSeed(state, seq, clock, (s) => ({ ...s, checkins }));
  if (checkins.length < HANGOUT_PEOPLE) return { state: next, hangout: [] };
  return { state: next, hangout: checkins.length === HANGOUT_PEOPLE ? checkins : [event.actor] };
};

/** An unsent or removed plan keeps its votes and answers, without its content. */
export const withUnsentSeed = (state: FarmState, seq: unknown): FarmState =>
  state.seeds.some((s) => s.seq === seq && (!s.unsent || contentless(s)))
    ? { ...state, seeds: state.seeds.map((s) => (s.seq === seq ? asUnsent(s) : s)) }
    : state;

/**
 * Once an appeal's `restored` is applied and the target is back (paged in with its payload), this
 * puts back what the removal took off the farm: an unsent plan's content, keeping its votes and
 * answers. Growth needs nothing back, because
 * the tombstone kept its facts. Pins and doorstep items stay down.
 */
export const applyRestored = (state: FarmState, target: FarmEvent): FarmState => {
  if (target.kind !== 'seed_planted' || isTombstone(target.payload)) return state;
  const current = seedOf(state, target.seq);
  if (current && !current.unsent) return state;
  const { seeds } = applySeedPlanted(
    { ...state, seeds: [] },
    target,
    target.day ?? state.today.day,
  );
  const back = seeds.map((s) =>
    current
      ? {
          ...s,
          hat: current.hat,
          votes: current.votes,
          rsvps: current.rsvps,
          checkins: current.checkins,
        }
      : s,
  );
  const others = state.seeds.filter((s) => s.seq !== target.seq);
  return { ...state, seeds: [...others, ...back].sort((a, b) => a.seq - b.seq).slice(-100) };
};
