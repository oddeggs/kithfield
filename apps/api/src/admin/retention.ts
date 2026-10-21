/*
 * A report's copied context is evidence, kept only while it is needed: 90 days after the report
 * closes, the context, the excerpt, the reporters' notes and the excerpt in the member's note are
 * deleted. A child-safety case keeps them a year after it closes, the preservation US law asks of
 * material reported to NCMEC (18 U.S.C. 2258A), and an account deletion doesn't take them sooner
 * (`purgeModeration`). The decision and the notes people received stay. The audit log is kept 2
 * years.
 */

const DAY_MS = 24 * 60 * 60_000;
export const CONTEXT_KEPT_AFTER_CLOSE_MS = 90 * DAY_MS;
/** How long a closed child-safety case keeps its evidence. */
export const CHILD_SAFETY_KEPT_AFTER_CLOSE_MS = 365 * DAY_MS;
/** Matches the audit log's delete trigger (`0251_audit_log_two_years.sql`). */
export const AUDIT_KEPT_MS = 63_072_000_000;

/** Reports whose evidence has been kept long enough, binding the two cutoffs in order. */
const DUE = `closed_at IS NOT NULL
  AND closed_at <= CASE WHEN category = 'child_safety' THEN ? ELSE ? END`;

/**
 * Clears what reports closed more than 90 days ago (a year, for child safety) still hold. Returns
 * the reports cleared.
 */
export async function clearOldEvidence(db: D1Database, now: number): Promise<number> {
  const cutoffs = [now - CHILD_SAFETY_KEPT_AFTER_CLOSE_MS, now - CONTEXT_KEPT_AFTER_CLOSE_MS];
  const closed = `SELECT id FROM reports WHERE ${DUE}`;
  const [reports] = await db.batch([
    db
      .prepare(
        `UPDATE reports SET context_json = NULL, excerpt = NULL
         WHERE ${DUE} AND (context_json IS NOT NULL OR excerpt IS NOT NULL)`,
      )
      .bind(...cutoffs),
    db
      .prepare(
        `UPDATE report_filings SET note = NULL WHERE note IS NOT NULL AND report_id IN (${closed})`,
      )
      .bind(...cutoffs),
    db
      .prepare(
        `UPDATE safety_notes SET note_json = json_set(note_json, '$.excerpt', json('null'))
         WHERE json_extract(note_json, '$.note') = 'content_removed'
           AND json_extract(note_json, '$.excerpt') IS NOT NULL
           AND json_extract(note_json, '$.action') IN (
             SELECT id FROM moderation_actions WHERE report_id IN (${closed}))`,
      )
      .bind(...cutoffs),
  ]);
  return reports?.meta.changes ?? 0;
}

/** The daily job: old evidence cleared, audit entries older than 2 years deleted. */
export async function keepModerationTidy(db: D1Database, now: number): Promise<void> {
  await clearOldEvidence(db, now);
  await db
    .prepare('DELETE FROM audit_log WHERE at <= ?')
    .bind(now - AUDIT_KEPT_MS)
    .run();
}
