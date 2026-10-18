import type { FarmEvent, FarmState } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';

import type { Bindings } from '../env';
import { nextLocalHour } from './calendar';
import type { Farm } from './farm';
import type { FarmPorts } from './ports';
import type { FarmStore } from './store';

/*
 * The object's single alarm wakes for the earliest of: a farm chore the rules say is due
 * (harvest day, the season rolling over: `nextChoreAt`), the daily weather, the fire going out,
 * and slow posts arriving. Timers live in one table; a fired timer is deleted before its work, so
 * it never fires twice.
 */

/** The weather is fetched at 05:00 farm time, before anyone's morning. */
const WEATHER_HOUR = 5;

/** A chore that couldn't be written is tried again a minute later, never in a tight loop. */
const RETRY_MS = 60_000;

/** Keeps the next weather timer waiting while the keeper has set a town, and none otherwise. */
export const ensureWeather = (store: FarmStore, state: FarmState, now: number): void => {
  if (state.place === null) {
    store.deleteTimers('weather:');
    return;
  }
  const at = nextLocalHour(now, WEATHER_HOUR, state.timeZone);
  store.addTimer(`weather:${localDay(at, state.timeZone)}`, at);
};

/** After a change of town or calendar, the weather follows the new one. */
export const resetWeather = (store: FarmStore, state: FarmState, now: number): void => {
  store.deleteTimers('weather:');
  ensureWeather(store, state, now);
};

/** When the alarm should next ring. */
export const nextWake = (farm: Farm, ports: FarmPorts): number | null => {
  const state = farm.state;
  const timer = farm.store.nextDue();
  if (state === null) return timer;
  const now = ports.clock.now();
  const chore = ports.rules.nextChoreAt(state, now);
  const next = timer === null ? chore : Math.min(timer, chore);
  return next <= now ? now + RETRY_MS : next;
};

export type AlarmResult = {
  /** Events the farm wrote. */
  events: FarmEvent[];
  /** Slow posts that arrived, by seq, for their cottages to hear about now. */
  arrived: number[];
};

/** Writes the harvest, then the season roll, if the rules say they are due. */
const runChores = (farm: Farm, ports: FarmPorts, now: number): FarmEvent[] => {
  const events: FarmEvent[] = [];
  const first = farm.state;
  if (first === null) return events;
  const { harvest } = ports.rules.farmChores(first, now);
  const harvested = harvest === null ? null : farm.write(null, 'harvested', harvest, now);
  if (harvested !== null) events.push(harvested);
  const then = farm.state;
  const roll = then === null ? null : ports.rules.farmChores(then, now).roll;
  const rolled = roll === null ? null : farm.write(null, 'season_rolled', roll, now);
  if (rolled !== null) events.push(rolled);
  return events;
};

/** Runs every timer and chore that is due. */
export const runAlarm = async (
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
    const [kind, arg] = timer.key.split(':');
    let event: FarmEvent | null = null;
    if (kind === 'weather' && state.place !== null && arg !== undefined) {
      const reading = await ports.weather.today(env, state.place, arg);
      if (reading !== null)
        event = farm.write(null, 'weather', { day: arg, ...reading }, ports.clock.now());
    } else if (kind === 'fire_out' && state.fireLitAt !== null) {
      event = farm.write(null, 'fire', { state: 'out' }, now);
    } else if (kind === 'slow_post') {
      result.arrived.push(Number(arg));
    }
    if (event !== null) result.events.push(event);
  }
  result.events.push(...runChores(farm, ports, ports.clock.now()));
  const state = farm.state;
  if (state !== null) ensureWeather(farm.store, state, ports.clock.now());
  return result;
};
