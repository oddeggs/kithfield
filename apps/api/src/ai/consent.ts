import type { AiFeature, FarmId, PersonId } from '@kithfield/contracts';

/*
 * Every AI job reads consent again, from D1 (`/v1/me/consents`, auth's `consents` table), before it
 * reads anything it would send: an answer changed after a job was queued holds when it runs.
 */

/**
 * The consent wording in force (the app's `CONSENT_TEXT_VERSION`, sent with each answer). A yes
 * counts only when it was given to these words: a yes to older words is asked again, and until
 * then nothing is sent. Change both together whenever the sheets' words change.
 */
export const AI_CONSENT_TEXT_VERSION = '2026-10-19';

/** Whether the person said yes to the feature, now. Never asked counts as no. */
export async function hasConsent(
  db: D1Database,
  person: PersonId,
  feature: AiFeature,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 FROM consents WHERE person_id = ? AND feature = ? AND allowed = 1 AND text_version = ?',
    )
    .bind(person, feature, AI_CONSENT_TEXT_VERSION)
    .first();
  return row !== null;
}

/** The farm's members living there now who said yes to the feature. */
export async function consentingMembers(
  db: D1Database,
  farm: FarmId,
  feature: AiFeature,
): Promise<PersonId[]> {
  const { results } = await db
    .prepare(
      `SELECT m.person_id AS person FROM memberships m
       JOIN consents c ON c.person_id = m.person_id AND c.feature = ? AND c.allowed = 1
         AND c.text_version = ?
       WHERE m.farm_id = ? AND m.left_at IS NULL ORDER BY m.joined_at`,
    )
    .bind(feature, AI_CONSENT_TEXT_VERSION, farm)
    .all<{ person: PersonId }>();
  return results.map((r) => r.person);
}

/** Everyone living on the farm now, longest-standing first. */
export async function currentMembers(db: D1Database, farm: FarmId): Promise<PersonId[]> {
  const { results } = await db
    .prepare(
      'SELECT person_id AS person FROM memberships WHERE farm_id = ? AND left_at IS NULL ORDER BY joined_at',
    )
    .bind(farm)
    .all<{ person: PersonId }>();
  return results.map((r) => r.person);
}
