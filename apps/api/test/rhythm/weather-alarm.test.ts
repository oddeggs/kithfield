import type { FarmPlace } from '@kithfield/contracts';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FarmDO } from '../../src/farm/farm-object';
import type { WeatherProvider } from '../../src/farm/ports';
import { configureFarmPorts } from '../../src/farm/wiring';
import { WeatherKitError, weatherKitProvider } from '../../src/farm/weather/weatherkit';
import { op } from '../farm/support/client';
import {
  cast,
  hostOf,
  type Person,
  plantFarm,
  settled,
  type TestPorts,
  useTestPorts,
} from '../farm/support/doubles';

/*
 * The morning weather when the source fails: a refused key stops the asking, a source that is
 * down or slow is asked again later and later, and never once the farm's day has gone by.
 */

type Stub = DurableObjectStub<FarmDO>;

const london: FarmPlace = { city: 'London', country: 'GB', lat: 51.5, lng: -0.12 };
const MINUTE = 60_000;
/** 05:00 in London (BST) on 19 October 2054, when the first morning's weather is asked. */
const MORNING = Date.UTC(2054, 9, 19, 4, 0);

let ports: TestPorts;
let pip: Person;
let jitter = 0.5;

/** Swaps the weather source (and the jitter's dice) for the farms. */
const useWeather = (weather: WeatherProvider) =>
  configureFarmPorts({ ...ports, weather, random: () => jitter });

/** A weather source that fails every morning the same way, counting what it was asked. */
const failing = (error: () => Error) => {
  const asked: string[] = [];
  const provider: WeatherProvider = {
    today: (_env, _place, day) => {
      asked.push(day);
      return Promise.reject(error());
    },
  };
  return { asked, provider };
};

beforeEach(async () => {
  ports = useTestPorts();
  jitter = 0.5;
  ({ pip } = await cast('pip'));
});

const plantWithTown = async () => {
  const farm = await plantFarm(pip);
  await farm.stub.command(pip.id, {
    opId: op(1),
    kind: 'settings_changed',
    payload: { setting: 'place', place: london },
  });
  return farm;
};

const weatherTimers = (stub: Stub) =>
  hostOf(stub, (host) =>
    host.store.dueTimers(Number.MAX_SAFE_INTEGER).filter((t) => t.key.startsWith('weather:')),
  );

/** Moves the clock to the object's alarm and runs it. */
const fire = async (stub: Stub) => {
  await settled(stub);
  const at = await runInDurableObject(stub, (_farm, state) => state.storage.getAlarm());
  if (at === null) throw new Error('No alarm set');
  ports.clock.at = at;
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  return at;
};

describe('a weather source that is down', () => {
  it('is asked again later and later, one timer at a time, within the jitter', async () => {
    const down = failing(() => new WeatherKitError(503, null));
    useWeather(down.provider);
    const { stub } = await plantWithTown();
    // Each try rolls the dice for the next: the middle, then either edge of the ±20%.
    const dice = [0.5, 0, 0.999, 0.25];
    for (const [n, roll] of dice.entries()) {
      jitter = roll;
      useWeather(down.provider);
      const at = await fire(stub);
      if (n === 0) expect(at).toBe(MORNING);
      const timers = await weatherTimers(stub);
      expect(timers.map((t) => t.key)).toEqual([`weather:2054-10-19:${n + 1}`]);
      const base = 2 ** n * MINUTE;
      const delay = (timers[0]?.due ?? 0) - at;
      expect(delay).toBe(Math.round(base * (0.8 + 0.4 * roll)));
      expect(delay).toBeGreaterThanOrEqual(0.8 * base);
      expect(delay).toBeLessThanOrEqual(1.2 * base);
    }
    expect(down.asked).toEqual(dice.map(() => '2054-10-19'));
  });

  it('backs off for at most two hours', async () => {
    const down = failing(() => new WeatherKitError(429, null));
    useWeather(down.provider);
    const { stub } = await plantWithTown();
    await hostOf(stub, (host) => {
      host.store.deleteTimers('weather:');
      host.store.setTimer('weather:2054-10-19:12', MORNING + 60 * MINUTE);
      return host.schedule();
    });
    jitter = 0.999;
    useWeather(down.provider);
    const at = await fire(stub);
    const [timer, ...more] = await weatherTimers(stub);
    expect(more).toEqual([]);
    expect(timer?.key).toBe('weather:2054-10-19:13');
    expect((timer?.due ?? 0) - at).toBe(Math.round(120 * MINUTE * (0.8 + 0.4 * 0.999)));
  });

  it('gives up once the farm’s day has gone by, and waits for the next morning', async () => {
    const down = failing(() => new WeatherKitError(500, null));
    useWeather(down.provider);
    const { stub } = await plantWithTown();
    // A try late in the evening (22:30 in London) would next come after midnight.
    await hostOf(stub, (host) => {
      host.store.deleteTimers('weather:');
      host.store.setTimer('weather:2054-10-19:9', Date.UTC(2054, 9, 19, 21, 30));
      return host.schedule();
    });
    await fire(stub);
    expect(down.asked).toEqual(['2054-10-19']);
    expect((await weatherTimers(stub)).map((t) => [t.key, t.due])).toEqual([
      ['weather:2054-10-20', Date.UTC(2054, 9, 20, 4, 0)],
    ]);
  });

  it('never asks for a day that has already gone by', async () => {
    const down = failing(() => new WeatherKitError(500, null));
    useWeather(down.provider);
    const { stub } = await plantWithTown();
    await hostOf(stub, (host) => {
      host.store.deleteTimers('weather:');
      host.store.setTimer('weather:2054-10-18:4', Date.UTC(2054, 9, 19, 0, 30));
      return host.schedule();
    });
    await fire(stub);
    expect(down.asked).toEqual([]);
    expect((await weatherTimers(stub)).map((t) => t.key)).toEqual(['weather:2054-10-19']);
  });

  it('counts a timeout or a lost connection as down', async () => {
    const lost = failing(() => new WeatherKitError(0, 'timeout'));
    useWeather(lost.provider);
    const { stub } = await plantWithTown();
    await fire(stub);
    expect((await weatherTimers(stub)).map((t) => t.key)).toEqual(['weather:2054-10-19:1']);
  });

  it('treats anything else that goes wrong the same way, never a retry every minute', async () => {
    const odd = failing(() => new Error('something unexpected'));
    useWeather(odd.provider);
    const { stub } = await plantWithTown();
    await fire(stub);
    expect((await weatherTimers(stub)).map((t) => t.key)).toEqual(['weather:2054-10-19:1']);
  });
});

describe('a weather key Apple refuses', () => {
  let pem = '';
  beforeAll(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    let binary = '';
    for (const byte of der) binary += String.fromCharCode(byte);
    pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
  });

  it('is not asked again that day, and stops every farm here asking Apple', async () => {
    const asked: string[] = [];
    const real = weatherKitProvider({
      fetch: (input) => {
        asked.push(new Request(input).url);
        return Promise.resolve(Response.json({ reason: 'NOT_ENABLED' }, { status: 401 }));
      },
      cache: { get: () => Promise.resolve(null), put: () => Promise.resolve() },
      now: () => ports.clock.now(),
    });
    // The real provider, with a key for the farms (the tests' Worker has none).
    useWeather({
      today: (env, place, day, zone) =>
        real.today({ ...env, WEATHERKIT_KEY: pem }, place, day, zone),
    });
    const first = await plantWithTown();
    const second = await plantWithTown();
    expect(await fire(first.stub)).toBe(MORNING);
    expect(asked).toHaveLength(1);
    expect((await weatherTimers(first.stub)).map((t) => [t.key, t.due])).toEqual([
      ['weather:2054-10-20', Date.UTC(2054, 9, 20, 4, 0)],
    ]);
    expect(await fire(second.stub)).toBe(MORNING);
    expect(asked).toHaveLength(1);
    expect((await weatherTimers(second.stub)).map((t) => t.key)).toEqual(['weather:2054-10-20']);
  });
});
