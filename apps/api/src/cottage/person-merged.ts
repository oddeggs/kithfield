import { PersonMergedJob } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { cottageOf } from './stub';

/**
 * The cottage's part of a `person_merged` job on the `deletion` queue: the kept person's cottage
 * takes in the merged one's. Safe to run again, so a retried message does no harm.
 */
export async function handlePersonMerged(env: Bindings, job: PersonMergedJob): Promise<void> {
  const { from, into } = PersonMergedJob.parse(job);
  await cottageOf(env, into).absorb(from);
}
