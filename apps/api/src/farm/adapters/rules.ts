import type { FarmRules } from '../ports';

const missing = (): never => {
  throw new Error('The farm rules are not wired in yet');
};

/** The farm rules from `@kithfield/farm`, wired in once the reducer is merged. */
export const farmRules: FarmRules = {
  RULES_VERSION: 1,
  createFarm: missing,
  applyEvent: missing,
  checkCommand: missing,
  farmView: missing,
};
