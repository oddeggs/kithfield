import type { Critter, EventsQuery, WeatherSource } from '@kithfield/contracts';
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect } from 'vitest';

import { call, signInAnonymously } from '../../../src/auth/testing/client';
import type { CreateInput } from '../../../src/farm/actions';
import type { FarmDO } from '../../../src/farm/farm-object';
import { pageEvents, searchEvents } from '../../../src/farm/history';
import type { FarmHost } from '../../../src/farm/host';
import { farmRules } from '../../../src/farm/adapters/rules';
import type { Clock, FarmPorts, WeatherProvider } from '../../../src/farm/ports';
import { configureFarmPorts } from '../../../src/farm/wiring';

/*
 * The farm tests run on the real farm rules, real auth and real cottages. Only two edges are
 * stand-ins: the weather source (a network service) and the clock, so a test can reach harvest
 * day without waiting for it.
 */

export const critter = (species: Critter['species']): Critter => ({
  species,
  coat: 'amber',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
});

/** Someone signed in anonymously, who has chosen a name and critter (`PATCH /v1/me/profile`). */
export type Person = { id: string; token: string; name: string; critter: Critter };

const SPECIES: Record<string, Critter['species']> = {
  Pip: 'mouse',
  Fig: 'frog',
  Bea: 'bear',
  Mo: 'mole',
  Kit: 'cat',
};

/** A new anonymous person, with their name and critter set as onboarding sets them. */
export const newPerson = async (handle: string): Promise<Person> => {
  const name = `${handle.charAt(0).toUpperCase()}${handle.slice(1)}`;
  const { token, user } = await signInAnonymously();
  const look = critter(SPECIES[name] ?? 'fox');
  const set = await call('/v1/me/profile', {
    method: 'PATCH',
    token,
    body: { name, critter: look },
  });
  expect(set.status).toBe(200);
  return { id: user.id, token, name, critter: look };
};

/** Several people at once, by name. */
export const cast = async <N extends string>(...names: N[]): Promise<Record<N, Person>> => {
  const people = await Promise.all(names.map((n) => newPerson(n)));
  return Object.fromEntries(names.map((n, i) => [n, people[i]])) as Record<N, Person>;
};

export const profile = (p: Person) => ({ name: p.name, critter: p.critter });

/** A request to the API as this person (their bearer session). */
export const api = async (person: Person | null, method: string, path: string, body?: unknown) => {
  const response = await call(path, {
    method,
    ...(person === null ? {} : { token: person.token }),
    ...(body === undefined ? {} : { body }),
  });
  const text = await response.text();
  return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as unknown };
};

/** A 5-minute socket token from auth's `POST /v1/rt-token`, for one farm. */
export const socketToken = async (person: Person, farm: string): Promise<string> => {
  const issued = await api(person, 'POST', '/v1/rt-token', { farm });
  expect(issued.status).toBe(200);
  return (issued.body as { token: string }).token;
};

/** A weather source that reports what the test sets. */
export class ScriptedWeather implements WeatherProvider {
  reading: { weather: 'rain' | 'frost' | 'heat' | 'none'; source: WeatherSource } | null = null;
  readonly asked: string[] = [];
  today(_env: unknown, _place: unknown, day: string) {
    this.asked.push(day);
    return Promise.resolve(this.reading);
  }
}

/** A clock the test moves by hand. */
export class TestClock implements Clock {
  constructor(public at: number) {}
  now(): number {
    return this.at;
  }
  advance(ms: number): void {
    this.at += ms;
  }
}

export type TestPorts = FarmPorts & { weather: ScriptedWeather; clock: TestClock };

/**
 * Noon in London on 18 October 2054: a Sunday-for-Sunday copy of 2026 (the calendar repeats every
 * 28 years), far enough ahead that no alarm the farm sets is already due by the wall clock.
 */
export const START = Date.UTC(2054, 9, 18, 11, 0);

/** The real rules; `rulesVersion` plants farms under an older version's label. */
export const useTestPorts = (options: { rulesVersion?: number; at?: number } = {}): TestPorts => {
  const ports: TestPorts = {
    rules:
      options.rulesVersion === undefined
        ? farmRules
        : { ...farmRules, RULES_VERSION: options.rulesVersion },
    weather: new ScriptedWeather(),
    clock: new TestClock(options.at ?? START),
  };
  configureFarmPorts(ports);
  return ports;
};

let farms = 0;

/** A fresh farm id, so tests never share an object. */
export const freshFarmId = (): string => `farm${Date.now().toString(36)}${(farms++).toString(36)}`;

export const farmStub = (farm: string) => env.FARM.get(env.FARM.idFromName(farm));

/** Plants a farm with `keeper` as keeper; the others join through an invite. */
export const plantFarm = async (
  keeper: Person,
  others: readonly Person[] = [],
  input: Partial<CreateInput> = {},
) => {
  const farm = freshFarmId();
  const stub = farmStub(farm);
  await stub.create({
    farm,
    kind: 'farm',
    name: 'The Thursday Lot',
    land: 'meadow',
    timeZone: 'Europe/London',
    hemisphere: 'north',
    keeper: keeper.id,
    pair: null,
    members: [{ person: keeper.id, profile: profile(keeper), via: 'created' }],
    ...input,
  });
  for (const person of others) await stub.join(person.id, profile(person), true);
  return { farm, stub };
};

type Inside = { host: FarmHost };

/** The farm's log as a test reads it, whoever lives there: straight from the object's store. */
export const pageOf = (stub: DurableObjectStub<FarmDO>, query: Partial<EventsQuery> = {}) =>
  runInDurableObject(stub, (farm) =>
    pageEvents((farm as unknown as Inside).host.store, { limit: 50, ...query }),
  );

/** Search as a test reads it. */
export const searchOf = (stub: DurableObjectStub<FarmDO>, q: string) =>
  runInDurableObject(stub, (farm) => searchEvents((farm as unknown as Inside).host.store, q));

/** The object's host, for tests that look inside. */
export const hostOf = <T>(
  stub: DurableObjectStub<FarmDO>,
  look: (host: FarmHost) => T | Promise<T>,
) => runInDurableObject(stub, (farm) => look((farm as unknown as Inside).host));

/** Waits until the farm has handed everything owed to the cottages (sent after each answer). */
export const settled = (stub: DurableObjectStub<FarmDO>) => hostOf(stub, (host) => host.flush());
