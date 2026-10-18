import type { Bindings } from '../env';
import { registerUrgentReportOpener, type UrgentMediaReport } from '../media/quarantine';
import { auditStatement } from './audit';
import { mintId, ruleToDb } from './ids';
import { dueAfter, suggestedRule } from './signals';
import { openReportFor } from './store';

/*
 * Quarantined media opens an urgent child-safety report on the desk: from Cloudflare's CSAM
 * scanning (`hash_match`), or from a moderator who found it (`member`). It is a case about the
 * uploader on that farm, so an open case about them there becomes urgent instead of a second one.
 * The copied context stays empty: the evidence is the quarantined object, never shown on the desk.
 */

/** Who a report names when the media index doesn't know the uploader. */
const UNKNOWN_UPLOADER = 'unknown-uploader';

const CATEGORY = 'child_safety' as const;

export async function openUrgentMediaReport(
  env: Bindings,
  input: UrgentMediaReport,
): Promise<string> {
  const db = env.DB;
  const item = { farm: input.farm, reported: input.uploader ?? UNKNOWN_UPLOADER, seq: null };
  const rule = ruleToDb(suggestedRule(CATEGORY));
  const logged = (report: string) =>
    auditStatement(db, {
      at: input.at,
      by: null,
      what: 'upload_blocked',
      item: report,
      rule: suggestedRule(CATEGORY),
      reason: input.note,
    });

  const open = await openReportFor(db, item);
  if (open === null) {
    const id = mintId('R');
    const [created] = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO reports (id, farm_id, reported_id, seq, kind, event_at, category,
             urgent, source, status, aimed_at, suggested_rule, excerpt, context_json, received_at,
             due_at)
           VALUES (?, ?, ?, NULL, 'media', NULL, ?, 1, ?, 'open', NULL, ?, NULL, '[]', ?, ?)`,
        )
        .bind(
          id,
          item.farm,
          item.reported,
          CATEGORY,
          input.source,
          rule,
          input.at,
          input.at + dueAfter(true),
        ),
    ]);
    if ((created?.meta.changes ?? 0) > 0) {
      await logged(id).run();
      return id;
    }
  }
  // A case about the uploader on this farm is open (or just opened): it becomes urgent.
  const kept = open ?? (await openReportFor(db, item));
  if (kept === null) throw new Error('no report could be opened for quarantined media');
  await db.batch([
    db
      .prepare(
        `UPDATE reports SET category = ?, urgent = 1, suggested_rule = ?,
           due_at = MIN(due_at, received_at + ?) WHERE id = ?`,
      )
      .bind(CATEGORY, rule, dueAfter(true), kept.id),
    logged(kept.id),
  ]);
  return kept.id;
}

registerUrgentReportOpener(openUrgentMediaReport);
