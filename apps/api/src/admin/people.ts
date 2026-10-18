import { FarmEvent, tombstoneOf } from '@kithfield/contracts';

/*
 * What the safety desk holds about a person when their account is deleted or merged into
 * another. Decisions, bans and the audit log keep their (pseudonymous) person ids either way, so
 * the record of what was done stays whole.
 */

const tombstoned = (event: unknown): unknown => {
  const parsed = FarmEvent.safeParse(event);
  const envelope = event as Record<string, unknown>;
  return {
    ...envelope,
    payload: parsed.success
      ? tombstoneOf(parsed.data, 'author_deleted')
      : { tombstone: 'author_deleted' },
  };
};

/**
 * A deleted account: their notes go, their appeal texts are blanked, their reports of others are
 * withdrawn, the context of reports about them is cleared (unless escalated, which keeps it for
 * the senior or legal look), and their words in other reports' context become tombstones.
 */
export async function purgeModeration(db: D1Database, person: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM safety_notes WHERE person_id = ?').bind(person),
    db.prepare("UPDATE appeals SET text = '' WHERE person_id = ?").bind(person),
    db.prepare('DELETE FROM report_filings WHERE reporter_id = ?').bind(person),
    db
      .prepare(
        `UPDATE reports SET context_json = NULL, excerpt = NULL
         WHERE reported_id = ? AND status != 'escalated'`,
      )
      .bind(person),
  ]);
  const { results } = await db
    .prepare(
      `SELECT id, context_json FROM reports
       WHERE context_json IS NOT NULL AND instr(context_json, ?) > 0`,
    )
    .bind(JSON.stringify(person))
    .all<{ id: string; context_json: string }>();
  const rewrites = results.flatMap((row) => {
    let events: unknown[];
    try {
      events = JSON.parse(row.context_json) as unknown[];
    } catch {
      return [];
    }
    const next = events.map((e) =>
      (e as { actor?: unknown }).actor === person ? tombstoned(e) : e,
    );
    return [
      db
        .prepare('UPDATE reports SET context_json = ? WHERE id = ?')
        .bind(JSON.stringify(next), row.id),
    ];
  });
  if (rewrites.length > 0) await db.batch(rewrites);
}

/**
 * A person merged into another: their filings, the reports about them, their appeals and notes
 * move to the kept person. Where both had an open case about the same item, the filings join the
 * kept person's case.
 */
export async function mergeModeration(db: D1Database, from: string, into: string): Promise<void> {
  await db.batch([
    db
      .prepare('UPDATE OR IGNORE report_filings SET reporter_id = ? WHERE reporter_id = ?')
      .bind(into, from),
    db.prepare('DELETE FROM report_filings WHERE reporter_id = ?').bind(from),
    db.prepare('UPDATE reports SET aimed_at = ? WHERE aimed_at = ?').bind(into, from),
    db.prepare('UPDATE appeals SET person_id = ? WHERE person_id = ?').bind(into, from),
    db.prepare('UPDATE safety_notes SET person_id = ? WHERE person_id = ?').bind(into, from),
    db
      .prepare(
        `UPDATE safety_notes SET note_json = json_set(note_json, '$.about', ?)
         WHERE json_extract(note_json, '$.about') = ?`,
      )
      .bind(into, from),
  ]);
  const { results } = await db
    .prepare('SELECT id, farm_id, seq FROM reports WHERE reported_id = ?')
    .bind(from)
    .all<{ id: string; farm_id: string; seq: number | null }>();
  for (const report of results) {
    const moved = await db
      .prepare('UPDATE OR IGNORE reports SET reported_id = ? WHERE id = ?')
      .bind(into, report.id)
      .run();
    if (moved.meta.changes === 1) continue;
    // The kept person already has an open case about this item: the filings join it.
    const kept = await db
      .prepare(
        `SELECT id FROM reports WHERE farm_id = ? AND reported_id = ? AND IFNULL(seq, 0) = ?
         AND closed_at IS NULL`,
      )
      .bind(report.farm_id, into, report.seq ?? 0)
      .first<{ id: string }>();
    if (kept === null) continue;
    const decided = await db
      .prepare('SELECT COUNT(*) AS n FROM moderation_actions WHERE report_id = ?')
      .bind(report.id)
      .first<{ n: number }>();
    await db.batch([
      db
        .prepare('UPDATE OR IGNORE report_filings SET report_id = ? WHERE report_id = ?')
        .bind(kept.id, report.id),
      db.prepare('DELETE FROM report_filings WHERE report_id = ?').bind(report.id),
      ...((decided?.n ?? 0) === 0
        ? [db.prepare('DELETE FROM reports WHERE id = ?').bind(report.id)]
        : []),
    ]);
  }
}
