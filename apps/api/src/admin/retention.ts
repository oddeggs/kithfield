/*
 * A report's copied context is evidence, kept only while it is needed: it is deleted 90 days
 * after the report closes. The excerpt goes with it. The decision, the audit log and the notes
 * people received stay.
 */

export const CONTEXT_KEPT_AFTER_CLOSE_MS = 90 * 24 * 60 * 60_000;

/** The daily job: clears the context of reports closed more than 90 days ago. */
export async function clearOldEvidence(db: D1Database, now: number): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE reports SET context_json = NULL, excerpt = NULL
       WHERE closed_at IS NOT NULL AND closed_at <= ? AND (context_json IS NOT NULL OR excerpt IS NOT NULL)`,
    )
    .bind(now - CONTEXT_KEPT_AFTER_CLOSE_MS)
    .run();
  return result.meta.changes;
}
