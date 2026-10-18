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
 * new person for it. The anonymous person takes the identity instead, keeping their id: the new
 * person's identity, accounts and sessions move over, and the new person is deleted. One batch,
 * so it happens whole or not at all.
 */
export async function adoptIdentity(
  db: D1Database,
  input: { anonymous: string; fresh: string; now: number },
): Promise<void> {
  const identity = await db
    .prepare('SELECT email, email_verified, name, image FROM people WHERE id = ?')
    .bind(input.fresh)
    .first<IdentityRow>();
  if (identity === null) throw new Error('the new person to adopt is missing');
  await db.batch([
    db
      .prepare('UPDATE accounts SET person_id = ?1 WHERE person_id = ?2')
      .bind(input.anonymous, input.fresh),
    db
      .prepare('UPDATE sessions SET person_id = ?1 WHERE person_id = ?2')
      .bind(input.anonymous, input.fresh),
    db.prepare('DELETE FROM people WHERE id = ?').bind(input.fresh),
    db
      .prepare(
        `UPDATE people
         SET email = ?1, email_verified = ?2, name = ?3, image = ?4, is_anonymous = 0, updated_at = ?5
         WHERE id = ?6`,
      )
      .bind(
        identity.email,
        identity.email_verified,
        identity.name,
        identity.image,
        authTime(input.now),
        input.anonymous,
      ),
  ]);
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
 * An anonymous person signed in as someone who already exists (a second device, or a reinstall).
 * The returning person wins: they keep everything they have, and take from the anonymous person
 * only what they lack (the age check, a later Terms acceptance, a name and critter chosen before
 * signing in). Then the anonymous person is deleted with their sessions.
 */
export async function mergeIntoReturning(
  db: D1Database,
  input: { anonymous: string; returning: string; now: number },
): Promise<void> {
  const [from, into] = await Promise.all([
    findPerson(db, input.anonymous),
    findPerson(db, input.returning),
  ]);
  if (into === null) throw new Error('the returning person is missing');
  if (from === null) return;
  const terms = laterTerms(into, from);
  await db.batch([
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
    db.prepare('DELETE FROM people WHERE id = ?').bind(input.anonymous),
  ]);
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
