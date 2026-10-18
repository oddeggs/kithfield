import type { FarmEvent, FarmState, LocalDate, SeasonRef } from '@kithfield/contracts';

import type { Bindings } from '../env';
import {
  formatDate,
  harvestDay,
  localDate,
  nextLocalHour,
  nextSeasonStart,
  seasonOf,
  seasonStart,
  zonedInstant,
} from './calendar';
import type { Farm } from './farm';
import type { FarmPorts } from './ports';
import type { FarmStore } from './store';

/*
 * The farm's timers, all in one table and served by the object's single alarm: the season rolling
 * over, harvest day, the daily weather, the fire going out, and slow posts arriving. A timer is
 * added only while it is still ahead, and only if it isn't already waiting, so a late alarm never
 * loses a harvest and a fired timer never fires twice.
 */

/** The weather is fetched at 05:00 farm time, before anyone's morning. */
const WEATHER_HOUR = 5;

const dateOf = (key: string): { year: number; month: number; day: number } => {
  const [year, month, day] = (key.split(':')[1] ?? '').split('-').map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
};

/** Makes sure the calendar's next timers are waiting. */
export const ensureTimers = (store: FarmStore, state: FarmState, now: number): void => {
  const tz = state.timeZone;
  const next = nextSeasonStart(now, tz);
  store.addTimer(`season:${formatDate(next)}`, zonedInstant(next, 0, tz));
  const harvest = harvestDay(seasonStart(now, tz));
  const harvestAt = zonedInstant(harvest, 0, tz);
  if (harvestAt > now) store.addTimer(`harvest:${formatDate(harvest)}`, harvestAt);
  if (state.place === null) {
    store.deleteTimers('weather:');
  } else {
    const at = nextLocalHour(now, WEATHER_HOUR, tz);
    store.addTimer(`weather:${localDate(at, tz)}`, at);
  }
};

/** After a calendar change, the season, harvest and weather timers follow the new time zone. */
export const resetCalendarTimers = (store: FarmStore, state: FarmState, now: number): void => {
  for (const prefix of ['season:', 'harvest:', 'weather:']) store.deleteTimers(prefix);
  ensureTimers(store, state, now);
};

const sameSeason = (a: SeasonRef, b: SeasonRef) => a.season === b.season && a.year === b.year;

export type AlarmResult = {
  /** Events the farm wrote. */
  events: FarmEvent[];
  /** Slow posts that arrived, by seq, for their cottages to hear about now. */
  arrived: number[];
};

/** Runs every timer that is due. */
export const runTimers = async (
  farm: Farm,
  ports: FarmPorts,
  env: Bindings,
): Promise<AlarmResult> => {
  const result: AlarmResult = { events: [], arrived: [] };
  const now = ports.clock.now();
  for (const timer of farm.store.dueTimers(now)) {
    const state = farm.state;
    farm.store.deleteTimer(timer.key);
    if (state === null) continue;
    const kind = timer.key.split(':')[0];
    let event: FarmEvent | null = null;
    if (kind === 'season') {
      const season = seasonOf(dateOf(timer.key), state.hemisphere);
      if (!sameSeason(season, state.season)) event = farm.write(null, 'season_rolled', season, now);
    } else if (kind === 'harvest') {
      const day = dateOf(timer.key);
      const payload = { ...seasonOf(day, state.hemisphere), day: formatDate(day) };
      event = farm.write(null, 'harvested', payload, now);
    } else if (kind === 'weather' && state.place !== null) {
      const day: LocalDate = formatDate(dateOf(timer.key));
      const reading = await ports.weather.today(env, state.place, day);
      if (reading !== null)
        event = farm.write(null, 'weather', { day, ...reading }, ports.clock.now());
    } else if (kind === 'fire_out' && state.fireLitAt !== null) {
      event = farm.write(null, 'fire', { state: 'out' }, now);
    } else if (kind === 'slow_post') {
      result.arrived.push(Number(timer.key.split(':')[1]));
    }
    if (event !== null) result.events.push(event);
  }
  const state = farm.state;
  if (state !== null) ensureTimers(farm.store, state, ports.clock.now());
  return result;
};
