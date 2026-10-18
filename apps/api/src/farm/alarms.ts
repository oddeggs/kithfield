import { FarmEvent, type FarmState, type TradedPayload } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';

import { markMediaReferenced } from '../media/sweep';
import { nextLocalHour } from './calendar';
import { mediaKeys } from './content';
import type { Farm } from './farm';
import type { FarmHost } from './host';
import type { FarmPorts } from './ports';
import type { FarmStore } from './store';

/*
 * The object's single alarm wakes for the earliest of: a farm chore the rules say is due
 * (harvest day, the season rolling over: `nextChoreAt`), the daily weather, the fire going out,
 * slow posts arriving, a socket that never said hello, and anything owed that
 * failed (D1's membership mirror, cottage news, a trade's other half), retried a minute later.
 */

/** The weather is fetched at 05:00 farm time, before anyone's morning. */
const WEATHER_HOUR = 5;

/** Anything that failed is tried again a minute later, never in a tight loop. */
export const RETRY_MS = 60_000;

/** A socket must say hello within this long. */
export const HELLO_DEADLINE_MS = 30_000;

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
  const now = ports.clock.now();
  const halves = farm.store.tradeHalves().length > 0;
  const times = [
    farm.store.nextDue(),
    farm.store.nextDelivery(),
    state === null ? null : ports.rules.nextChoreAt(state, now),
    halves ? now + RETRY_MS : null,
  ].filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  const next = Math.min(...times);
  return next <= now ? now + RETRY_MS : next;
};

/** Writes the harvest, then the season roll, if the rules say they are due. */
const runChores = (farm: Farm, ports: FarmPorts, now: number, events: FarmEvent[]): void => {
  const first = farm.state;
  if (first === null) return;
  const { harvest } = ports.rules.farmChores(first, now);
  const harvested = harvest === null ? null : farm.write(null, 'harvested', harvest, now);
  if (harvested !== null) events.push(harvested);
  const then = farm.state;
  const roll = then === null ? null : ports.rules.farmChores(then, now).roll;
  const rolled = roll === null ? null : farm.write(null, 'season_rolled', roll, now);
  if (rolled !== null) events.push(rolled);
};

/** One timer's work; it may write events to `events`. Throws if it should be tried again. */
const runTimer = async (host: FarmHost, key: string, events: FarmEvent[]): Promise<void> => {
  const { farm } = host;
  const state = farm.state;
  const now = host.now();
  const [kind, arg] = key.split(':');
  if (state === null) return;
  if (kind === 'weather' && state.place !== null && arg !== undefined) {
    const reading = await host.ports().weather.today(host.env, state.place, arg, state.timeZone);
    const event =
      reading === null ? null : farm.write(null, 'weather', { day: arg, ...reading }, host.now());
    if (event !== null) events.push(event);
  } else if (kind === 'fire_out' && state.fireLitAt !== null) {
    const event = farm.write(null, 'fire', { state: 'out' }, now);
    if (event !== null) events.push(event);
  } else if (kind === 'slow_post') {
    host.arrived(Number(arg));
  } else if (kind === 'd1sync') {
    const parsed = FarmEvent.safeParse(host.store.event(Number(arg)));
    if (parsed.success) await host.mirror(parsed.data);
  } else if (kind === 'mediaref') {
    const parsed = FarmEvent.safeParse(host.store.event(Number(arg)));
    if (parsed.success) {
      await markMediaReferenced(host.env.DB, mediaKeys(parsed.data), host.now());
    }
  } else if (kind === 'hello') {
    host.closeUnnamed(now - HELLO_DEADLINE_MS);
  }
};

/** A trade's other half that never landed is written on the visitor's farm now. */
const finishTrades = async (host: FarmHost): Promise<void> => {
  for (const half of host.store.tradeHalves()) {
    try {
      const stub = host.env.FARM.get(host.env.FARM.idFromName(half.otherFarm));
      const payload = half.payload as TradedPayload;
      const result = await stub.recordTrade(half.opId, half.actor, payload, undefined, {
        completing: true,
      });
      if (result.result === 'rejected')
        console.error('trade half refused', { reason: result.reason });
      host.store.tradeHalfDone(half.opId);
    } catch (error) {
      console.warn('trade half not yet written', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
};

/**
 * Runs every timer and chore that is due, each on its own: one that fails is retried later and
 * never stops the rest. Returns what the farm wrote, for the caller to publish and settle.
 */
export const runAlarm = async (host: FarmHost, events: FarmEvent[]): Promise<void> => {
  const { farm } = host;
  // Old rejections and held payloads go whenever the farm wakes; no wake is spent on them alone.
  farm.store.prune(host.now());
  for (const timer of farm.store.dueTimers(host.now())) {
    farm.store.deleteTimer(timer.key);
    try {
      await runTimer(host, timer.key, events);
    } catch (error) {
      console.error('farm timer failed', {
        timer: timer.key.split(':')[0],
        error: error instanceof Error ? error.message : 'unknown',
      });
      farm.store.setTimer(timer.key, host.now() + RETRY_MS);
    }
  }
  try {
    runChores(farm, host.ports(), host.now(), events);
  } catch (error) {
    console.error('farm chores failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
  await finishTrades(host);
  await host.flush();
};
