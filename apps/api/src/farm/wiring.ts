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

/**
 * The rules version farms move to and start on: this server's, held back to `target` (the
 * environment's `RULES_TARGET`) while the phones out there can't read newer rules yet.
 */
export const rulesTarget = (target: string | undefined, version: number): number => {
  const wanted = /^\d+$/.test(target?.trim() ?? '') ? Number(target) : version;
  return Math.max(1, Math.min(version, wanted));
};

/** `ports` with the rules' version held to the environment's target. */
export const targetedPorts = (
  ports: () => FarmPorts,
  target: string | undefined,
): (() => FarmPorts) => {
  let from: FarmPorts | null = null;
  let to: FarmPorts | null = null;
  return () => {
    const now = ports();
    if (now !== from || to === null) {
      const version = rulesTarget(target, now.rules.RULES_VERSION);
      from = now;
      to =
        version === now.rules.RULES_VERSION
          ? now
          : { ...now, rules: { ...now.rules, RULES_VERSION: version } };
    }
    return to;
  };
};
