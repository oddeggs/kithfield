import type { FarmState, LocalDate, PersonId, Weather } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';

import type { StoredEvent } from '../../data';

/* What the farm's rhythm shows as it opens: shared rain, and today's real weather. */

const fieldOf = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)[key]
    : undefined;

/** Today's `shared_rain` among the newest events, if the phone holds it. */
export function sharedRainToday(
  events: readonly StoredEvent[],
  today: LocalDate,
): readonly PersonId[] | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || e.kind !== 'shared_rain') continue;
    const day = fieldOf(e.payload, 'day');
    const people = fieldOf(e.payload, 'people');
    if (day !== today || !Array.isArray(people)) return null;
    return people.filter((p): p is PersonId => typeof p === 'string');
  }
  return null;
}

/**
 * Whether to show the shared rain moment: rain today that you were part of, and not shown yet
 * today (`seenOn` is the day it last showed on this phone).
 */
export function showSharedRain(
  view: FarmView,
  people: readonly PersonId[] | null,
  me: PersonId | null,
  seenOn: LocalDate | null,
): boolean {
  return view.sharedRain && me !== null && !!people && people.includes(me) && seenOn !== view.today;
}

export type RealWeather = Exclude<Weather, 'none'>;

/** Today's weather from the keeper's town, with where it came from, or null for none. */
export interface TodayWeather {
  readonly weather: RealWeather;
  readonly city: string;
  /** The source the farm recorded, for its attribution; null if the phone doesn't hold it. */
  readonly source: string | null;
}

export function todayWeather(
  state: FarmState,
  view: FarmView,
  events: readonly StoredEvent[],
): TodayWeather | null {
  const weather = view.weather;
  if (!weather || weather === 'none' || !state.place) return null;
  const recorded = [...events]
    .reverse()
    .find((e) => e.kind === 'weather' && fieldOf(e.payload, 'day') === view.today);
  const source = fieldOf(recorded?.payload, 'source');
  return {
    weather,
    city: state.place.city,
    source: typeof source === 'string' ? source : null,
  };
}

/** What the weather screen shows: today's weather, a calm day, or a farm with no town to follow. */
export const weatherKind = (
  weather: TodayWeather | null,
  hasTown: boolean,
): RealWeather | 'none' | 'noTown' => weather?.weather ?? (hasTown ? 'none' : 'noTown');
