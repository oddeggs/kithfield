import { farmRules } from './adapters/rules';
import type { FarmPorts } from './ports';
import { weatherKit } from './weather/weatherkit';

const production: FarmPorts = {
  rules: farmRules,
  weather: weatherKit,
  clock: { now: () => Date.now() },
};

let current: FarmPorts = production;

/** The ports the farm object and routes use. */
export const farmPorts = (): FarmPorts => current;

/** Swaps ports for tests and local tools; production never calls it. */
export const configureFarmPorts = (ports: Partial<FarmPorts>): void => {
  current = { ...production, ...ports };
};
