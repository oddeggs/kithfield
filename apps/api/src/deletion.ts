import { PersonMergedJob } from '@kithfield/contracts';
import type { z } from 'zod';

import { handlePersonMerged } from './cottage/person-merged';
import type { Bindings } from './env';

/*
 * The `deletion` queue's consumer: work that follows a person's rows out of D1 and into the
 * Durable Objects. Each message names its `kind`; a part of the API registers the kinds it
 * handles with `registerDeletionJob` (`person_merged` here, account deletion, exports and consent
 * withdrawals where they are built).
 */

/** One part of the API's share of a merge. Must be safe to run again: a retry runs every step. */
export type PersonMergedStep = (env: Bindings, job: PersonMergedJob) => Promise<void>;

/**
 * The steps a `person_merged` job runs, in order. The cottage moves the person's chat list,
 * devices and seeds; the farm object adds its step (memberships and snapshot members).
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

/** A kind of message on the deletion queue: its schema and what runs it. Must be safe to rerun. */
interface DeletionJob {
  readonly schema: z.ZodType<unknown>;
  readonly run: (env: Bindings, job: unknown) => Promise<void>;
}

const jobs = new Map<string, DeletionJob>();

/**
 * Handles messages whose `kind` is `kind`, parsed with `schema`. A kind is registered once; the
 * returned function removes it again.
 */
export function registerDeletionJob<T>(
  kind: string,
  schema: z.ZodType<T>,
  run: (env: Bindings, job: T) => Promise<void>,
): () => void {
  if (jobs.has(kind)) throw new Error(`a deletion job ${kind} is registered`);
  jobs.set(kind, { schema, run: (env, job) => run(env, job as T) });
  return () => {
    jobs.delete(kind);
  };
}

registerDeletionJob('person_merged', PersonMergedJob, async (env, job) => {
  for (const step of personMergedSteps.values()) await step(env, job);
});

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
 * Runs each message's job. A message this Worker can't read is acked and logged, never retried
 * forever; a job that fails retries the message with back-off and, after the queue's retries,
 * sends it to the dead-letter queue.
 */
export async function consumeDeletion(batch: MessageBatch, env: Bindings): Promise<void> {
  for (const message of batch.messages) {
    const kind = kindOf(message.body);
    const handler = kind === null ? undefined : jobs.get(kind);
    const job = handler?.schema.safeParse(message.body);
    if (handler === undefined || job === undefined || !job.success) {
      console.warn('unknown deletion message', { id: message.id, kind });
      message.ack();
      continue;
    }
    try {
      await handler.run(env, job.data);
      message.ack();
    } catch (error) {
      console.error('deletion job failed', {
        id: message.id,
        kind,
        attempts: message.attempts,
        error,
      });
      message.retry({ delaySeconds: deletionBackoffSeconds(message.attempts) });
    }
  }
}
