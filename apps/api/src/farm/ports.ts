import type { EpochMs, FarmPlace, LocalDate, Weather, WeatherSource } from '@kithfield/contracts';
import type * as rules from '@kithfield/farm';

import type { Bindings } from '../env';

/**
 * The farm rules from `@kithfield/farm`, as the object uses them. Only the version can differ
 * from the package's, so a test can plant a farm under an older rules version.
 */
export interface FarmRules {
  readonly RULES_VERSION: number;
  readonly createFarm: typeof rules.createFarm;
  readonly applyEvent: typeof rules.applyEvent;
  readonly checkCommand: typeof rules.checkCommand;
  readonly farmView: typeof rules.farmView;
  readonly farmChores: typeof rules.farmChores;
  readonly nextChoreAt: typeof rules.nextChoreAt;
  readonly farmDay: typeof rules.farmDay;
}

export type WeatherReading = { weather: Weather; source: WeatherSource };

/** Today's weather for the keeper's town; null when there is none to report. */
export interface WeatherProvider {
  today(env: Bindings, place: FarmPlace, day: LocalDate): Promise<WeatherReading | null>;
}

export interface Clock {
  now(): EpochMs;
}

/**
 * What the farm object takes from outside: the rules, the weather source (a network service) and
 * the clock. Auth and the cottages are called directly.
 */
export interface FarmPorts {
  rules: FarmRules;
  weather: WeatherProvider;
  clock: Clock;
}

/** A person's name and critter, as drawn in `joined` and at the gate. */
export type { Profile } from './adapters/identity';
