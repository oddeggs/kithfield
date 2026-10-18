import {
  LIMITS,
  SURFACES_VERSION,
  type FarmList,
  type FarmState,
  type Lang,
  type PersonId,
  type SeasonRef,
  type SurfaceData,
  type SurfaceFarm,
  type SurfacePerson,
} from '@kithfield/contracts';
import { localDay, planDay, seasonOf } from '@kithfield/farm';

import { surfaceLink } from './links';
import { imageNames } from './names';

/*
 * `SurfaceData` from what the phone holds: the farm list, each farm's state as the data layer has
 * it, and its newest cached events. Pure, so the widgets' picture is tested without a phone.
 */

export type FarmRow = FarmList['farms'][number];

/** An event as the cache keeps it, the fields read here. */
export interface CachedEvent {
  readonly at: number;
  readonly actor: string | null;
  readonly kind: string;
  readonly payload: unknown;
}

export interface FarmSource {
  readonly row: FarmRow;
  /** Null until the phone has synced the farm once. */
  readonly state: FarmState | null;
  /** The newest cached events, oldest first. */
  readonly events: readonly CachedEvent[];
}

export interface SurfaceInput {
  readonly farms: readonly FarmSource[];
  readonly me: PersonId;
  readonly lang: Lang;
  /** The app's link scheme: `kithfield` or `kithfield-dev`. */
  readonly scheme: string;
  readonly now: number;
}

/** At most this many farms are written; the newest activity first. */
export const SURFACE_FARMS = 100;

const person = (id: PersonId, name: string | null): SurfacePerson => ({
  person: id,
  name,
  image: imageNames.critter(id),
});

/** The season the farm is in, or the northern one by the phone's clock before it has synced. */
function seasonFor(state: FarmState | null, now: number): SeasonRef {
  return state?.season ?? seasonOf(localDay(now, 'UTC'), 'north');
}

/** Who sat down by the fire since it was lit: the people of its `lit` and `sat` events. */
export function firePeople(
  state: FarmState,
  events: readonly CachedEvent[],
): SurfacePerson[] | null {
  const litAt = state.fireLitAt;
  if (litAt === null) return null;
  const seen = new Set<string>();
  const people: SurfacePerson[] = [];
  for (const event of events) {
    if (event.kind !== 'fire' || event.at < litAt || event.actor === null) continue;
    const fire = (event.payload as { state?: string } | null)?.state;
    if (fire === 'out') {
      people.length = 0;
      seen.clear();
      continue;
    }
    if (seen.has(event.actor)) continue;
    const member = state.members.find((m) => m.person === event.actor);
    if (!member) continue;
    seen.add(event.actor);
    people.push(person(member.person, member.name));
  }
  return people.slice(0, LIMITS.fireVoices);
}

/** The next sprouted plan on or after today (farm time): its day, start and place. */
export function nextPlan(state: FarmState, now: number): SurfaceFarm['nextPlan'] {
  const today = localDay(now, state.timeZone);
  let best: SurfaceFarm['nextPlan'] = null;
  for (const seed of state.seeds) {
    if (seed.sproutedAt === null || seed.someday || seed.title === null) continue;
    const day = planDay(seed);
    if (day === null || day < today) continue;
    const from = seed.days.find((d) => d.date === day)?.from ?? null;
    const candidate = {
      seed: seed.seq,
      title: seed.title,
      date: day,
      from,
      place: seed.place?.name ?? null,
    };
    if (best === null || `${day} ${from ?? ''}` < `${best.date} ${best.from ?? ''}`) {
      best = candidate;
    }
  }
  return best;
}

export function surfaceFarm(source: FarmSource, input: SurfaceInput): SurfaceFarm {
  const { row, state, events } = source;
  const visit = row.kind === 'visit';
  const link = surfaceLink(input.scheme, { to: 'farm', farm: row.farm });
  const members = state?.members ?? [];
  // A farm's widget shows the friends; a visit keeps both, so the share sheet can draw the pair.
  const critters = members
    .filter((m) => visit || m.person !== input.me)
    .map((m) => ({
      ...person(m.person, m.name),
      critter: m.critter,
      joinedAt: m.joinedAt,
      lastOpenedAt: m.lastOpenedAt,
      lastWokenAt: m.lastWokenAt,
      hibernating: m.hibernating,
      pausedUntil: m.pausedUntil,
      link: surfaceLink(input.scheme, { to: 'critter', farm: row.farm, person: m.person }),
    }));
  const fire = state && state.fireLitAt !== null ? state.fireLitAt : null;
  const lastAt = events.reduce((latest, e) => Math.max(latest, e.at), row.joinedAt);
  return {
    farm: row.farm,
    kind: row.kind,
    name: visit ? null : (state?.name ?? row.name),
    with: row.with ? person(row.with.person, row.with.name) : null,
    season: seasonFor(state, input.now),
    images: { day: imageNames.farmDay(row.farm), night: imageNames.farmNight(row.farm) },
    critters: critters.slice(0, LIMITS.members),
    fire: state && fire !== null ? { litAt: fire, people: firePeople(state, events) ?? [] } : null,
    nextPlan: state ? nextPlan(state, input.now) : null,
    knocks: [],
    weather: null,
    link,
    updatedAt: lastAt,
  };
}

/** Everything the surfaces draw, newest activity first. */
export function surfaceData(input: SurfaceInput): SurfaceData {
  const farms = input.farms
    .map((source) => surfaceFarm(source, input))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SURFACE_FARMS);
  return { version: SURFACES_VERSION, lang: input.lang, writtenAt: input.now, farms };
}
