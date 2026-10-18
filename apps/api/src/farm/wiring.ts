import { farmRules } from './adapters/rules';
import { noWeather } from './adapters/weather';
import type { FarmPorts } from './ports';

const production: FarmPorts = {
  rules: farmRules,
  weather: noWeather,
  clock: { now: () => Date.now() },
};

let current: FarmPorts = production;

/** The ports the farm object and routes use. */
export const farmPorts = (): FarmPorts => current;

/** Swaps ports for tests and local tools; production never calls it. */
export const configureFarmPorts = (ports: Partial<FarmPorts>): void => {
  current = { ...production, ...ports };
};
