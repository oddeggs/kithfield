import { z } from 'zod';

import { EpochMs, PersonId } from './primitives';

/*
 * Messages on the queues that aren't push jobs (`PushJob` is in cottage.ts).
 */

/**
 * On the `deletion` queue: an anonymous person signed in to an account that already had a person,
 * and `from` was merged `into` it. Farms and cottages move what they key by person (memberships,
 * snapshot members, cottage rows, devices, remember-me seeds) from `from` to `into`. Past events
 * are not rewritten: their actor stays `from`, and readers map it to `into`.
 */
export const PersonMergedJob = z.object({
  kind: z.literal('person_merged'),
  from: PersonId,
  into: PersonId,
  at: EpochMs,
});
export type PersonMergedJob = z.infer<typeof PersonMergedJob>;
