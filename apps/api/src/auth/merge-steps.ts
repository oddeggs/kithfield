import type { PersonMergedJob } from '@kithfield/contracts';

/**
 * What other parts of the API add when an anonymous person merges into a returning one.
 *
 * The rule: the returning person (`into`) wins. A step moves the anonymous person's (`from`) rows
 * that the returning person should keep (a farm they joined, a device they registered) and drops
 * the rest; the anonymous person is deleted at the end of the same batch, so anything still
 * pointing at them goes with them or is left dangling. Steps return statements rather than running
 * them, so the whole merge commits or fails as one D1 batch. State that lives in Durable Objects is
 * moved after the batch commits, from the `person_merged` message on the deletion queue.
 */

export interface PersonMerge {
  /** The anonymous person, deleted at the end of the merge. */
  readonly from: string;
  /** The returning person, who keeps their id and everything they have. */
  readonly into: string;
  readonly now: number;
}

export type MergeStep = (db: D1Database, merge: PersonMerge) => D1PreparedStatement[];

const steps = new Map<string, MergeStep>();

/** Adds a step under a unique name; the returned function removes it again. */
export function registerMergeStep(name: string, step: MergeStep): () => void {
  if (steps.has(name)) throw new Error(`a merge step named ${name} is already registered`);
  steps.set(name, step);
  return () => {
    steps.delete(name);
  };
}

/** Every registered step's statements, in registration order. */
export function mergeStepStatements(db: D1Database, merge: PersonMerge): D1PreparedStatement[] {
  return [...steps.values()].flatMap((step) => step(db, merge));
}

export async function announceMerge(queue: Queue, merge: PersonMerge): Promise<void> {
  const job: PersonMergedJob = {
    kind: 'person_merged',
    from: merge.from,
    into: merge.into,
    at: merge.now,
  };
  await queue.send(job);
}
