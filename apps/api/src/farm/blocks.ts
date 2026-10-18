import type { PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';

/**
 * Whether either person has blocked the other, so no visit opens between them (the person asking
 * just sees "not found"). Blocking belongs to the safety work and has no table yet: until
 * it lands, nobody is blocked. This is the one place to read it from.
 */
export const isBlocked = (_env: Bindings, _a: PersonId, _b: PersonId): Promise<boolean> =>
  Promise.resolve(false);
