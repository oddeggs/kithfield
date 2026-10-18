import { PersonMergedJob } from '@kithfield/contracts';

import { handlePersonMerged } from './cottage/person-merged';
import type { Bindings } from './env';

/*
 * The `deletion` queue's consumer: work that follows a person's rows out of D1 and into the
 * Durable Objects. Today that is `person_merged` (an anonymous person merged into a returning
 * one); account deletion joins it later.
 */

/** One part of the API's share of a merge. Must be safe to run again: a retry runs every step. */
export type PersonMergedStep = (env: Bindings, job: PersonMergedJob) => Promise<void>;

/**
 * The steps a `person_merged` job runs, in order. The cottage moves the person's chat list,
 * devices and seeds. The farm object adds its step (memberships and snapshot members) with
 * `registerPersonMergedStep` when it lands.
 */
const personMergedSteps = new Map<string, PersonMergedStep>([['cottage', handlePersonMerged]]);

/** Adds a step under a unique name; the returned function removes it again. */
export function registerPersonMergedStep(name: string, step: PersonMergedStep): () => void {
  if (personMergedSteps.has(name)) throw new Error(`a merge step named ${name} is registered`);
  personMergedSteps.set(name, step);
  return () => {
    personMergedSteps.delete(name);
  };
}

/** Seconds before a retry: 30, 60, 120… up to 15 minutes. After the queue's retries, the DLQ. */
export function deletionBackoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(0, attempts - 1), 15 * 60);
}

/** The message's `kind`, if it names one, for the log; never the rest of the body. */
function kindOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('kind' in body)) return null;
  return typeof body.kind === 'string' ? body.kind.slice(0, 64) : null;
}

/**
 * Runs each message's steps. A message this Worker can't read is acked and logged, never retried
 * forever; a step that fails retries the message with back-off and, after the queue's retries,
 * sends it to the dead-letter queue.
 */
export async function consumeDeletion(batch: MessageBatch, env: Bindings): Promise<void> {
  for (const message of batch.messages) {
    const job = PersonMergedJob.safeParse(message.body);
    if (!job.success) {
      console.warn('unknown deletion message', { id: message.id, kind: kindOf(message.body) });
      message.ack();
      continue;
    }
    try {
      for (const step of personMergedSteps.values()) await step(env, job.data);
      message.ack();
    } catch (error) {
      console.error('person merge failed', { id: message.id, attempts: message.attempts, error });
      message.retry({ delaySeconds: deletionBackoffSeconds(message.attempts) });
    }
  }
}
