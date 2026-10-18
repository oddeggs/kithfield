import type { PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';

/**
 * Whether either person has blocked the other: no visit opens between them, no gesture or trade
 * passes, and the gate doesn't show one to the other. Blocking belongs to the safety work and has
 * no table yet: until it lands, nobody is blocked. Every check reads it from here, so the safety
 * work replaces `blocks.isBlocked` in one place.
 */
export const blocks = {
  isBlocked: (_env: Bindings, _a: PersonId, _b: PersonId): Promise<boolean> =>
    Promise.resolve(false),
};
