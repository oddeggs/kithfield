import { DELETION_GRACE_MS } from './me';
import { mergeStepStatements } from './merge-steps';

/** Reads and writes on `people` that Better Auth doesn't do itself. */

export interface PersonRecord {
  readonly id: string;
  readonly isAnonymous: boolean;
  readonly ageOk: boolean;
  readonly termsVersion: string | null;
  readonly termsAt: number | null;
  readonly displayName: string | null;
  readonly critter: string | null;
}

interface PersonRow {
  id: string;
  is_anonymous: number | null;
  age_ok: number | null;
  terms_version: string | null;
  terms_at: number | null;
  display_name: string | null;
  critter: string | null;
}

export async function findPerson(db: D1Database, person: string): Promise<PersonRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, is_anonymous, age_ok, terms_version, terms_at, display_name, critter
       FROM people WHERE id = ?`,
    )
    .bind(person)
    .first<PersonRow>();
  if (row === null) return null;
  return {
    id: row.id,
    isAnonymous: row.is_anonymous === 1,
    ageOk: row.age_ok === 1,
    termsVersion: row.terms_version,
    termsAt: row.terms_at,
    displayName: row.display_name,
    critter: row.critter,
  };
}

/** Better Auth stores its own times as ISO text. */
function authTime(now: number): string {
  return new Date(now).toISOString();
}

interface IdentityRow {
  email: string;
  email_verified: number;
  name: string;
  image: string | null;
}

/**
 * An anonymous person signed in with an identity seen for the first time, and Better Auth made a
 * new person for it. The anonymous person takes the identity instead, keeping their id: their
 * anonymous sessions end, the new person's identity, accounts and sessions move over, and the new
 * person is deleted. One batch, and every statement in it holds only while the anonymous person is
 * still anonymous, so of two upgrades racing for one person exactly one lands. Answers whether
 * this one did.
 */
export async function adoptIdentity(
  db: D1Database,
  input: { anonymous: string; fresh: string; now: number },
): Promise<boolean> {
  const identity = await db
    .prepare('SELECT email, email_verified, name, image FROM people WHERE id = ?')
    .bind(input.fresh)
    .first<IdentityRow>();
  if (identity === null) throw new Error('the new person to adopt is missing');
  const stillAnonymous = 'EXISTS (SELECT 1 FROM people WHERE id = ?1 AND is_anonymous = 1)';
  const results = await db.batch([
    db
      .prepare(`DELETE FROM sessions WHERE person_id = ?1 AND ${stillAnonymous}`)
      .bind(input.anonymous),
    db
      .prepare(`UPDATE accounts SET person_id = ?1 WHERE person_id = ?2 AND ${stillAnonymous}`)
      .bind(input.anonymous, input.fresh),
    db
      .prepare(`UPDATE sessions SET person_id = ?1 WHERE person_id = ?2 AND ${stillAnonymous}`)
      .bind(input.anonymous, input.fresh),
    db
      .prepare(`DELETE FROM people WHERE id = ?2 AND ${stillAnonymous}`)
      .bind(input.anonymous, input.fresh),
    db
      .prepare(
        `UPDATE people
         SET email = ?2, email_verified = ?3, name = ?4, image = ?5, is_anonymous = 0, updated_at = ?6
         WHERE id = ?1 AND is_anonymous = 1`,
      )
      .bind(
        input.anonymous,
        identity.email,
        identity.email_verified,
        identity.name,
        identity.image,
        authTime(input.now),
      ),
  ]);
  return results.at(-1)?.meta.changes === 1;
}

/** The later of two Terms versions (dates, so they sort as text), with when it was accepted. */
function laterTerms(
  a: PersonRecord,
  b: PersonRecord,
): Pick<PersonRecord, 'termsVersion' | 'termsAt'> {
  if (a.termsVersion === null) return b;
  if (b.termsVersion === null) return a;
  return a.termsVersion >= b.termsVersion ? a : b;
}

/**
 * Runs between a merge's reads and its batch. Nothing waits here in the service; a test puts
 * another request's write into this gap to show the batch re-checks what the reads saw.
 */
export const mergeGap: { wait: (merge: { from: string; into: string }) => Promise<void> } = {
  wait: () => Promise.resolve(),
};

/**
 * An anonymous person signed in as someone who already exists (a second device, or a reinstall).
 * The returning person wins: they keep everything they have, and take from the anonymous person
 * only what they lack (the age check, a later Terms acceptance, a name and critter chosen before
 * signing in). Then the registered merge steps (`merge-steps.ts`) move other tables' rows, and the
 * anonymous person is deleted with their sessions; all in one batch. The batch's first statement
 * fails it, rolling back everything, unless the anonymous person is still anonymous then, so a
 * merge never lands on someone another request has just signed in. Answers whether it landed.
 */
export async function mergeIntoReturning(
  db: D1Database,
  input: { anonymous: string; returning: string; now: number },
): Promise<boolean> {
  const [from, into] = await Promise.all([
    findPerson(db, input.anonymous),
    findPerson(db, input.returning),
  ]);
  if (into === null) throw new Error('the returning person is missing');
  if (!from?.isAnonymous) return false;
  const terms = laterTerms(into, from);
  const merge = { from: input.anonymous, into: input.returning, now: input.now };
  await mergeGap.wait(merge);
  const statements = [
    // `json_extract` of something that isn't JSON raises an error, which aborts the batch.
    db
      .prepare(
        `SELECT CASE WHEN EXISTS (SELECT 1 FROM people WHERE id = ?1 AND is_anonymous = 1)
         THEN 1 ELSE json_extract('not json', '$') END`,
      )
      .bind(input.anonymous),
    db
      .prepare(
        `UPDATE people
         SET age_ok = ?1, terms_version = ?2, terms_at = ?3, display_name = ?4, critter = ?5,
             updated_at = ?6
         WHERE id = ?7`,
      )
      .bind(
        into.ageOk || from.ageOk ? 1 : null,
        terms.termsVersion,
        terms.termsAt,
        into.displayName ?? from.displayName,
        into.critter ?? from.critter,
        authTime(input.now),
        input.returning,
      ),
    ...mergeStepStatements(db, merge),
    db.prepare('DELETE FROM people WHERE id = ? AND is_anonymous = 1').bind(input.anonymous),
  ];
  try {
    await db.batch(statements);
    return true;
  } catch (error) {
    const now = await findPerson(db, input.anonymous);
    if (!now?.isAnonymous) return false;
    throw error;
  }
}

/**
 * Records that the person signs in with an email code, as an identity of its own (`email-otp`,
 * keyed by the address), so their sign-in methods can be told apart.
 */
export async function recordEmailIdentity(
  db: D1Database,
  input: { person: string; email: string; now: number },
): Promise<void> {
  const at = authTime(input.now);
  await db
    .prepare(
      `INSERT OR IGNORE INTO accounts (id, account_id, provider_id, person_id, created_at, updated_at)
       VALUES (?, ?, 'email-otp', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), input.email.trim().toLowerCase(), input.person, at, at)
    .run();
}

/** Signing in again within the 30 days cancels a pending account deletion. */
export async function cancelPendingDeletion(
  db: D1Database,
  person: string,
  now: number,
): Promise<void> {
  await db
    .prepare('UPDATE people SET deleted_at = NULL WHERE id = ? AND deleted_at > ?')
    .bind(person, now - DELETION_GRACE_MS)
    .run();
}

/** Whether the person's 30 days are over: they are being deleted, and can't sign in any more. */
export async function isBeingPurged(db: D1Database, person: string, now: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM people WHERE id = ? AND deleted_at <= ?')
    .bind(person, now - DELETION_GRACE_MS)
    .first();
  return row !== null;
}

export async function deleteSession(db: D1Database, session: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(session).run();
}

export async function recordAgeOk(db: D1Database, person: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE people SET age_ok = 1, updated_at = ? WHERE id = ?')
    .bind(authTime(now), person)
    .run();
}

export async function recordTerms(
  db: D1Database,
  input: { person: string; version: string; now: number },
): Promise<void> {
  await db
    .prepare('UPDATE people SET terms_version = ?, terms_at = ?, updated_at = ? WHERE id = ?')
    .bind(input.version, input.now, authTime(input.now), input.person)
    .run();
}

/** Deletes a person outright, with their sessions and identities (the tables cascade). */
export async function deletePerson(db: D1Database, person: string): Promise<void> {
  await db.prepare('DELETE FROM people WHERE id = ?').bind(person).run();
}
