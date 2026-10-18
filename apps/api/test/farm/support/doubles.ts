import type { CottageDelivery, Critter, PersonId, WeatherSource } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';

import type { CreateInput } from '../../../src/farm/actions';
import type {
  Clock,
  CottageNotifier,
  FarmPorts,
  Identity,
  Profile,
  WeatherProvider,
} from '../../../src/farm/ports';
import { configureFarmPorts } from '../../../src/farm/wiring';
import { testFarmRules } from './test-rules';

/*
 * Test doubles at the farm object's edges: auth's tokens and sessions, the cottage, the weather
 * and the clock. Each test file installs them with `useTestPorts`.
 */

export const critter = (species: Critter['species'] = 'fox'): Critter => ({
  species,
  coat: 'amber',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
});

export const PROFILES: Record<string, Profile> = {
  pip: { name: 'Pip', critter: critter('mouse') },
  fig: { name: 'Fig', critter: critter('frog') },
  bea: { name: 'Bea', critter: critter('bear') },
  mo: { name: 'Mo', critter: critter('mole') },
  kit: { name: 'Kit', critter: critter('cat') },
};

/** A socket token the test identity accepts for that person and farm. */
export const tokenFor = (person: PersonId, farm: string): string => `test-token.${person}.${farm}`;

/** The header the test identity reads the caller from. */
export const as = (person: PersonId): HeadersInit => ({ Authorization: `Test ${person}` });

/** Stands in for auth: tokens are `test-token.<person>.<farm>`, sessions `Authorization: Test <person>`. */
export const testIdentity: Identity = {
  socketPerson: (_env, token, farm) => {
    const m = /^test-token\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
    return Promise.resolve(m !== null && m[2] === farm ? (m[1] ?? null) : null);
  },
  requestPerson: (_env, request) => {
    const m = /^Test ([A-Za-z0-9_-]+)$/.exec(request.headers.get('Authorization') ?? '');
    return Promise.resolve(m?.[1] ?? null);
  },
  profile: (_env, person) => Promise.resolve(PROFILES[person] ?? null),
};

/** Stands in for the cottages: records every delivery. */
export class RecordingCottages implements CottageNotifier {
  readonly deliveries: { person: PersonId; delivery: CottageDelivery }[] = [];
  deliver(_env: unknown, person: PersonId, delivery: CottageDelivery): Promise<void> {
    this.deliveries.push({ person, delivery });
    return Promise.resolve();
  }
  for(person: PersonId): CottageDelivery[] {
    return this.deliveries.filter((d) => d.person === person).map((d) => d.delivery);
  }
}

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

export type TestPorts = FarmPorts & {
  cottage: RecordingCottages;
  weather: ScriptedWeather;
  clock: TestClock;
};

/**
 * Noon in London on 18 October 2054: a Sunday-for-Sunday copy of 2026 (the calendar repeats every
 * 28 years), far enough ahead that no alarm the farm sets is already due by the wall clock.
 */
export const START = Date.UTC(2054, 9, 18, 11, 0);

export const useTestPorts = (options: { rulesVersion?: number; at?: number } = {}): TestPorts => {
  const ports: TestPorts = {
    rules: testFarmRules(options.rulesVersion),
    identity: testIdentity,
    cottage: new RecordingCottages(),
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

/** Plants a farm with Pip as keeper; the others join through an invite. */
export const plantFarm = async (
  others: readonly string[] = ['fig'],
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
    keeper: 'pip',
    pair: null,
    members: [{ person: 'pip', profile: PROFILES['pip']!, via: 'created' }],
    ...input,
  });
  for (const person of others) await stub.join(person, PROFILES[person]!, true);
  return { farm, stub };
};
