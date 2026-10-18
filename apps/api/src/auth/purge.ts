import { EpochMs, PersonId } from '@kithfield/contracts';
import { z } from 'zod';

import { cottageOf } from '../cottage/stub';
import { registerDeletionJob } from '../deletion';
import type { Bindings } from '../env';
import { addressHash } from './email-code';
import { forgetExports } from './export';
import { DELETION_GRACE_MS } from './me';

/*
 * The purge, once a person's 30 days are over: the daily job puts an `account_deleted` message on
 * the deletion queue for each, and its consumer runs the steps below in order. The farms write
 * `left {how: account_deleted}` and tombstone what the person wrote (registered by the farm
 * module), other parts delete what they keep (their registered steps), the cottage is emptied,
 * their keepsakes exports are deleted from R2, Apple is asked to revoke the person's tokens, and
 * last the person's D1 rows go. Every step is
 * safe to run again: a retried message runs them all, and the D1 rows go only after the rest.
 */

/**
 * On the `deletion` queue: a person whose deletion wait is over. `at` is when they asked. Local to
 * the API: the API both sends and handles it.
 */
export const AccountDeletedJob = z.object({
  kind: z.literal('account_deleted'),
  person: PersonId,
  at: EpochMs,
});
export type AccountDeletedJob = z.infer<typeof AccountDeletedJob>;

/** One part of the API's share of a purge. Must be safe to run again. */
export type AccountDeletionStep = (env: Bindings, person: string) => Promise<void>;

/**
 * Where Sign in with Apple's tokens are revoked. Apple's revoke endpoint needs a client secret
 * signed with the team's `.p8` key and a token from exchanging the sign-in's authorization code,
 * neither of which exists yet (the app signs in with the identity token only). Until they do this
 * does nothing; then it is replaced here with one that revokes the person's Apple tokens.
 */
export interface AppleRevocation {
  revoke(env: Bindings, input: { person: string; appleAccounts: readonly string[] }): Promise<void>;
}

export const appleRevocation: { current: AppleRevocation } = {
  current: { revoke: () => Promise.resolve() },
};

/**
 * Steps other parts register, in order, between emptying the cottage and deleting the D1 rows:
 * `farms` (the farm module), then media and AI-derived data as those parts land (the media lane's
 * R2 keys that no farm event names, for one). Each removes only what it keeps for the person.
 */
const steps = new Map<string, AccountDeletionStep>();

/** Adds a step under a unique name; the returned function removes it again. */
export function registerAccountDeletionStep(name: string, step: AccountDeletionStep): () => void {
  if (steps.has(name)) throw new Error(`an account deletion step named ${name} is registered`);
  steps.set(name, step);
  return () => {
    steps.delete(name);
  };
}

/** The person's rows in D1, deleted last, in one batch. `people` cascades sessions and identities. */
async function deleteRows(env: Bindings, person: string): Promise<void> {
  const db = env.DB;
  const email = await db
    .prepare('SELECT email FROM people WHERE id = ?')
    .bind(person)
    .first<{ email: string }>();
  const byPerson = [
    'DELETE FROM device_action_keys WHERE person_id = ?',
    'DELETE FROM deletion_codes WHERE person_id = ?',
    'DELETE FROM push_ledger WHERE person_id = ?',
    'DELETE FROM memberships WHERE person_id = ?',
    'DELETE FROM farm_waiting WHERE person_id = ?',
    'DELETE FROM farm_visitors WHERE person_id = ?',
    'DELETE FROM farm_merges WHERE from_person = ?1 OR into_person = ?1',
    'DELETE FROM blocks WHERE blocker_id = ?',
    'DELETE FROM people WHERE id = ?',
  ];
  const statements = byPerson.map((sql) => db.prepare(sql).bind(person));
  if (email !== null) {
    // The address's sign-in code counts, kept only as its hash.
    const hash = await addressHash(email.email);
    statements.push(
      db.prepare('DELETE FROM email_code_sends WHERE address_hash = ?').bind(hash),
      db.prepare('DELETE FROM email_code_failures WHERE address_hash = ?').bind(hash),
    );
  }
  await db.batch(statements);
}

/** Whether the person is still waiting to be purged now: asked, not cancelled, 30 days over. */
async function stillDue(env: Bindings, person: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM people WHERE id = ? AND deleted_at <= ?')
    .bind(person, now - DELETION_GRACE_MS)
    .first();
  return row !== null;
}

/** Runs a purge. A person who signed in meanwhile, or who is already gone, is left alone. */
export async function purgeAccount(env: Bindings, job: AccountDeletedJob): Promise<void> {
  const { person } = job;
  if (!(await stillDue(env, person, Date.now()))) return;
  for (const step of steps.values()) await step(env, person);
  await cottageOf(env, person).deleteAccount();
  await forgetExports(env, person);
  const apple = await env.DB.prepare(
    "SELECT account_id FROM accounts WHERE person_id = ? AND provider_id = 'apple'",
  )
    .bind(person)
    .all<{ account_id: string }>();
  await appleRevocation.current.revoke(env, {
    person,
    appleAccounts: apple.results.map((r) => r.account_id),
  });
  await deleteRows(env, person);
}

registerDeletionJob('account_deleted', AccountDeletedJob, purgeAccount);

/** Most people put on the queue by one daily run; the rest wait for the next. */
const PURGES_PER_RUN = 1000;

/**
 * The daily job's part: everyone whose 30 days are over goes on the deletion queue. Someone already
 * queued yesterday and still there is queued again, which is harmless: a purge runs once.
 */
export async function queueDuePurges(env: Bindings, now: number): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, deleted_at FROM people WHERE deleted_at IS NOT NULL AND deleted_at <= ?
     ORDER BY deleted_at LIMIT ${PURGES_PER_RUN}`,
  )
    .bind(now - DELETION_GRACE_MS)
    .all<{ id: string; deleted_at: number }>();
  for (let i = 0; i < results.length; i += 100) {
    const jobs = results.slice(i, i + 100).map((row): { body: AccountDeletedJob } => ({
      body: { kind: 'account_deleted', person: row.id, at: row.deleted_at },
    }));
    await env.DELETION_QUEUE.sendBatch(jobs);
  }
  return results.length;
}
