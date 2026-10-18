/*
 * A report's copied context is evidence, kept only while it is needed: 90 days after the report
 * closes, the context, the excerpt, the reporters' notes and the excerpt in the member's note are
 * deleted. The decision and the notes people received stay. The audit log is kept 2 years.
 */

const DAY_MS = 24 * 60 * 60_000;
export const CONTEXT_KEPT_AFTER_CLOSE_MS = 90 * DAY_MS;
/** Matches the audit log's delete trigger (`0251_audit_log_two_years.sql`). */
export const AUDIT_KEPT_MS = 63_072_000_000;

/** Clears what reports closed more than 90 days ago still hold. Returns the reports cleared. */
export async function clearOldEvidence(db: D1Database, now: number): Promise<number> {
  const cutoff = now - CONTEXT_KEPT_AFTER_CLOSE_MS;
  const closed = `SELECT id FROM reports WHERE closed_at IS NOT NULL AND closed_at <= ?`;
  const [reports] = await db.batch([
    db
      .prepare(
        `UPDATE reports SET context_json = NULL, excerpt = NULL
         WHERE closed_at IS NOT NULL AND closed_at <= ? AND (context_json IS NOT NULL OR excerpt IS NOT NULL)`,
      )
      .bind(cutoff),
    db
      .prepare(
        `UPDATE report_filings SET note = NULL WHERE note IS NOT NULL AND report_id IN (${closed})`,
      )
      .bind(cutoff),
    db
      .prepare(
        `UPDATE safety_notes SET note_json = json_set(note_json, '$.excerpt', json('null'))
         WHERE json_extract(note_json, '$.note') = 'content_removed'
           AND json_extract(note_json, '$.excerpt') IS NOT NULL
           AND json_extract(note_json, '$.action') IN (
             SELECT id FROM moderation_actions WHERE report_id IN (${closed}))`,
      )
      .bind(cutoff),
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
