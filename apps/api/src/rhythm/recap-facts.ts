import {
  type Credit,
  type EventKind,
  type FarmEvent,
  type FarmState,
  isTombstone,
  KNOWN_POLLINATOR_REASONS,
  LIMITS,
  type LocalDate,
  type PersonId,
} from '@kithfield/contracts';
import { addDays, aliasOf, CARE, careOf, localDay, weekday } from '@kithfield/farm';

import type { FarmStore } from '../farm/store';
import { eventsBetween } from './week-log';

/*
 * What a Sunday recap is made of, read inside the farm object from the week's log (Monday to
 * Sunday by each event's farm day): who tended and with which kinds of care, the plans of the
 * week, and the qualities each member showed, from which the route picks the best pollinator.
 * Nothing here is a count: a person tended or didn't, showed a quality or didn't.
 *
 * Tends are credited as the reducer credits them: every kind in the care families, a check-in
 * once a hangout has two people there, and shared rain for each person in it.
 */

export type PollinatorReasonName = (typeof KNOWN_POLLINATOR_REASONS)[number];

export type RecapFacts = {
  week: LocalDate;
  /** Who lives on the farm now. */
  members: PersonId[];
  thanks: Credit[];
  plans: number[];
  /** For each member who tended, the qualities of their week, in `KNOWN_POLLINATOR_REASONS` order. */
  qualities: { person: PersonId; reasons: PollinatorReasonName[] }[];
};

/** A member who was away this long and opened the farm again came back (critters doze at 4 days). */
const CAME_BACK_AFTER_MS = 4 * 86_400_000;
/** Tending on this many of the week's seven days keeps the farm warm. */
const WARM_DAYS = 4;
const HANGOUT_PEOPLE = 2;
const PLANS_MAX = 50;

/** Gestures addressed to one friend, by kind: what checking on everyone is made of. */
const ADDRESSED: ReadonlySet<EventKind> = new Set([
  'dewdrop',
  'firefly',
  'wave',
  'knock',
  'hug',
  'gift',
]);

const READ_KINDS: readonly EventKind[] = [
  ...(Object.keys(CARE) as EventKind[]),
  'checkin',
  'shared_rain',
];

/**
 * The Sunday a recap is for: `asked` when it is a Sunday that has come, else null; without one,
 * today when today is Sunday (the recap of the week ending today), or else the last Sunday.
 */
export const recapWeek = (today: LocalDate, asked: LocalDate | null): LocalDate | null => {
  const latest = addDays(today, -weekday(today));
  if (asked === null) return latest;
  return weekday(asked) === 0 && asked <= latest ? asked : null;
};

/** The fields an event's reader may use: its payload, or what its tombstone kept. */
const factsOf = (event: FarmEvent): Readonly<Record<string, unknown>> =>
  isTombstone(event.payload) ? (event.payload.facts ?? {}) : event.payload;

const personField = (facts: Readonly<Record<string, unknown>>, key: string): string | null => {
  const value = facts[key];
  return typeof value === 'string' ? value : null;
};

type Reading = {
  state: FarmState;
  store: FarmStore;
  week: LocalDate;
  monday: LocalDate;
};

/** Each person's kinds of care and the days they tended, as the reducer credits them. */
const tendsOf = (r: Reading, events: readonly FarmEvent[]) => {
  const kinds = new Map<PersonId, EventKind[]>();
  const days = new Map<PersonId, Set<LocalDate>>();
  const credit = (person: PersonId, kind: EventKind, day: LocalDate) => {
    const who = aliasOf(r.state, person);
    const list = kinds.get(who) ?? [];
    if (!list.includes(kind)) list.push(kind);
    kinds.set(who, list);
    days.set(who, (days.get(who) ?? new Set()).add(day));
  };
  const checkins = new Map<string, Set<PersonId>>();
  const hangouts = new Set<number>();
  for (const event of events) {
    const day = event.day ?? localDay(event.at, r.state.timeZone);
    if (event.kind === 'shared_rain' && !isTombstone(event.payload)) {
      for (const person of event.payload.people) credit(person, 'shared_rain', day);
    } else if (event.kind === 'checkin' && event.actor !== null) {
      const seed = factsOf(event)['seed'];
      if (typeof seed !== 'number') continue;
      const key = `${seed}:${day}`;
      const there = (checkins.get(key) ?? new Set()).add(aliasOf(r.state, event.actor));
      checkins.set(key, there);
      if (there.size >= HANGOUT_PEOPLE) {
        hangouts.add(seed);
        for (const person of there) credit(person, 'checkin', day);
      }
    } else if (event.actor !== null && careOf(event) !== null) {
      credit(event.actor, event.kind, day);
    }
  }
  return { kinds, days, hangouts };
};

/** Whom a person's addressed gestures reached this week. */
const reachedBy = (r: Reading, events: readonly FarmEvent[]) => {
  const reached = new Map<PersonId, Set<PersonId>>();
  for (const event of events) {
    if (event.actor === null || !ADDRESSED.has(event.kind)) continue;
    const facts = factsOf(event);
    const action = facts['action'];
    if (event.kind === 'firefly' && action !== 'left') continue;
    if (event.kind === 'gift' && action !== 'given') continue;
    let to = personField(facts, 'to');
    const target = facts['target'];
    if (to === null && event.kind === 'dewdrop' && typeof target === 'number') {
      to = r.store.event(target)?.actor ?? null;
    }
    if (to === null) continue;
    const from = aliasOf(r.state, event.actor);
    reached.set(from, (reached.get(from) ?? new Set()).add(aliasOf(r.state, to)));
  }
  return reached;
};

/** Members who opened the farm this week after being away four days or more. */
const cameBack = (r: Reading): Set<PersonId> => {
  const opened = eventsBetween(r.store, r.state.timeZone, addDays(r.monday, -4), r.week, [
    'farm_opened',
  ]);
  const last = new Map<PersonId, number>();
  for (const m of r.state.members) last.set(m.person, m.joinedAt);
  const back = new Set<PersonId>();
  for (const event of opened) {
    if (event.actor === null) continue;
    const who = aliasOf(r.state, event.actor);
    const day = event.day ?? localDay(event.at, r.state.timeZone);
    const before = last.get(who);
    // Opens in the four days before Monday only set when someone was last here.
    if (day >= r.monday && before !== undefined && event.at - before >= CAME_BACK_AFTER_MS) {
      back.add(who);
    }
    last.set(who, event.at);
  }
  return back;
};

/** The plans of the week: planted, sprouted, and hangouts held. */
const plansOf = (r: Reading, events: readonly FarmEvent[], hangouts: ReadonlySet<number>) => {
  const plans = new Set<number>(hangouts);
  for (const event of events) {
    if (event.kind === 'seed_planted' && !isTombstone(event.payload)) plans.add(event.seq);
  }
  for (const seed of r.state.seeds) {
    if (seed.unsent || seed.sproutedAt === null) continue;
    const day = localDay(seed.sproutedAt, r.state.timeZone);
    if (day >= r.monday && day <= r.week) plans.add(seed.seq);
  }
  return [...plans].sort((a, b) => a - b).slice(-PLANS_MAX);
};

/** Who planted a plan: from the farm's seeds, or the log when the seed has gone. */
const planterOf = (r: Reading, seed: number): PersonId | null => {
  const planter =
    r.state.seeds.find((s) => s.seq === seed)?.planter ?? r.store.event(seed)?.actor ?? null;
  return planter === null ? null : aliasOf(r.state, planter);
};

/** The recap's facts for the week ending on Sunday `week`. */
export const recapFacts = (store: FarmStore, state: FarmState, week: LocalDate): RecapFacts => {
  const monday = addDays(week, -6);
  const r: Reading = { state, store, week, monday };
  const events = eventsBetween(store, state.timeZone, monday, week, READ_KINDS);
  const { kinds, days, hangouts } = tendsOf(r, events);
  const members = state.members.map((m) => m.person);
  const current = new Set(members);

  const thanks: Credit[] = [
    ...members.filter((p) => kinds.has(p)),
    ...[...kinds.keys()].filter((p) => !current.has(p)),
  ]
    .slice(0, LIMITS.members)
    .map((person) => ({ person, kinds: (kinds.get(person) ?? []).slice(0, 40) }));

  const reached = reachedBy(r, events);
  const back = cameBack(r);
  const planners = new Set<PersonId>();
  for (const event of events) {
    if (event.kind === 'seed_planted' && event.actor !== null && !isTombstone(event.payload)) {
      planners.add(aliasOf(state, event.actor));
    }
  }
  for (const seed of hangouts) {
    const planter = planterOf(r, seed);
    if (planter !== null) planners.add(planter);
  }

  const tended = members.filter((p) => kinds.has(p));
  const qualityOf = (person: PersonId): Record<PollinatorReasonName, boolean> => {
    const own = kinds.get(person) ?? [];
    const others = members.filter((p) => p !== person);
    const theirs = reached.get(person);
    return {
      checked_on_everyone: others.length > 0 && others.every((p) => theirs?.has(p) === true),
      planned_a_hangout: planners.has(person),
      came_back: back.has(person),
      shared_pictures: events.some(
        (e) =>
          e.kind === 'media' &&
          !isTombstone(e.payload) &&
          e.actor !== null &&
          aliasOf(state, e.actor) === person,
      ),
      by_the_fire: own.includes('fire'),
      kept_it_warm: (days.get(person)?.size ?? 0) >= WARM_DAYS,
    };
  };
  let qualities = tended.map((person) => {
    const shown = qualityOf(person);
    return { person, reasons: KNOWN_POLLINATOR_REASONS.filter((reason) => shown[reason]) };
  });
  // Nobody stood out this week: everyone who tended kept the farm warm.
  if (qualities.every((q) => q.reasons.length === 0)) {
    qualities = tended.map((person) => ({ person, reasons: ['kept_it_warm'] }));
  }

  return { week, members, thanks, plans: plansOf(r, events, hangouts), qualities };
};

/** The recap's facts for the week asked (or the latest), or `bad_week` for one that can't be. */
export const recapOf = (
  store: FarmStore,
  state: FarmState,
  today: LocalDate,
  asked: LocalDate | null,
): RecapFacts | 'bad_week' => {
  const week = recapWeek(today, asked);
  return week === null ? 'bad_week' : recapFacts(store, state, week);
};
