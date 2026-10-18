import {
  RULES_VERSION,
  applyEvent,
  checkCommand,
  createFarm,
  farmChores,
  farmDay,
  farmView,
  nextChoreAt,
} from '@kithfield/farm';

import type { FarmRules } from '../ports';

/** The farm rules: the shared reducer every phone runs too. */
export const farmRules: FarmRules = {
  RULES_VERSION,
  createFarm,
  applyEvent,
  checkCommand,
  farmView,
  farmChores,
  nextChoreAt,
  farmDay,
};
