import type { PersonId } from '@kithfield/contracts';

import { eitherBlocked } from '../auth';
import type { Bindings } from '../env';

/**
 * Whether either person has blocked the other: no visit opens between them, no gesture or trade
 * passes, and the gate doesn't show one to the other. Every check reads it from here; blocks
 * themselves live in D1 (`PUT /v1/blocks/:person`).
 */
export const blocks = {
  isBlocked: (env: Bindings, a: PersonId, b: PersonId): Promise<boolean> =>
    eitherBlocked(env.DB, a, b),
};
