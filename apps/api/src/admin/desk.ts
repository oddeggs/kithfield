import {
  EventEnvelope,
  LIMITS,
  type QueuePage,
  type QueueQuery,
  type QueueRow,
  type ReportDetail,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { auditStatement } from './audit';
import { blockedByCount } from './blocking';
import type { Moderator } from './moderator';
import { farmNameOf, filingsOf, loadReport, personOf, toReport } from './store';

/* The queue (urgent first, then oldest first), a single report, and claiming one. */

const PAGE = 100;
const DAY_MS = 24 * 60 * 60_000;

type QueueRaw = Parameters<typeof toReport>[0] & {
  reporters: number;
  farm_kind: string | null;
  farm_name: string | null;
};

/** Keyset cursor over (urgent desc, received asc, id asc). */
const encodeCursor = (row: QueueRow) => `${row.urgent ? 1 : 0}.${row.receivedAt}.${row.report}`;
const decodeCursor = (cursor: string | undefined) => {
  const match = cursor === undefined ? null : /^([01])\.(\d+)\.([A-Za-z0-9_-]{1,64})$/.exec(cursor);
  return match === null
    ? null
    : { urgent: Number(match[1]), at: Number(match[2]), id: match[3] ?? '' };
};

/** `GET /admin/v1/queue`: every open report, urgent first, then oldest first. */
export async function queuePage(db: D1Database, query: QueueQuery): Promise<QueuePage> {
  const where = ['r.closed_at IS NULL'];
  const params: (string | number)[] = [];
  if (query.category !== undefined) {
    where.push('r.category = ?');
    params.push(query.category);
  }
  const after = decodeCursor(query.cursor);
  if (after !== null) {
    where.push(
      '(r.urgent < ? OR (r.urgent = ? AND (r.received_at > ? OR (r.received_at = ? AND r.id > ?))))',
    );
    params.push(after.urgent, after.urgent, after.at, after.at, after.id);
  }
  const { results } = await db
    .prepare(
      `SELECT r.*, f.kind AS farm_kind, f.name AS farm_name,
         (SELECT COUNT(*) FROM report_filings x WHERE x.report_id = r.id) AS reporters
       FROM reports r LEFT JOIN farms f ON f.id = r.farm_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.urgent DESC, r.received_at ASC, r.id ASC LIMIT ?`,
    )
    .bind(...params, PAGE + 1)
    .all<QueueRaw>();
  const rows = results.slice(0, PAGE).map((raw): QueueRow => {
    const report = toReport(raw);
    return {
      report: report.id,
      receivedAt: report.receivedAt,
      dueAt: report.dueAt,
      category: report.category,
      urgent: report.urgent,
      kind: report.kind,
      farm: report.farm,
      farmName: raw.farm_kind === 'visit' ? null : raw.farm_name,
      reporters: Math.min(raw.reporters, LIMITS.members),
      source: report.source,
      claimedBy: report.claimedBy,
    };
  });
  const last = rows.at(-1);
  return { rows, cursor: results.length > PAGE && last !== undefined ? encodeCursor(last) : null };
}

/**
 * Claims an open report nobody holds. `taken` when someone else holds it or it is closed; the
 * claim is in the audit log.
 */
export async function claimReport(
  env: Bindings,
  moderator: Moderator,
  id: string,
  now: number,
): Promise<'claimed' | 'mine' | 'taken' | 'missing'> {
  const report = await loadReport(env.DB, id);
  if (report === null) return 'missing';
  const [claim] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE reports SET claimed_by = ?, status = CASE WHEN status = 'open' THEN 'claimed' ELSE status END
       WHERE id = ? AND closed_at IS NULL AND claimed_by IS NULL`,
    ).bind(moderator.id, id),
  ]);
  if (claim?.meta.changes === 1) {
    await auditStatement(env.DB, { at: now, by: moderator.id, what: 'claimed', item: id }).run();
    return 'claimed';
  }
  const after = await loadReport(env.DB, id);
  return after?.claimedBy === moderator.id && after.closedAt === null ? 'mine' : 'taken';
}

/**
 * `GET /admin/v1/reports/:id`: the report, and the look at its context logged. Reading never
 * claims it: that is `POST …/claim`, or the first decision. Null when there is no such report.
 */
export async function openReport(
  env: Bindings,
  moderator: Moderator,
  id: string,
  now: number,
): Promise<ReportDetail | null> {
  const report = await loadReport(env.DB, id);
  if (report === null) return null;
  await auditStatement(env.DB, {
    at: now,
    by: moderator.id,
    what: 'opened_context',
    item: report.id,
  }).run();

  const [filings, reported, farmName, earlier, blockedBy] = await Promise.all([
    filingsOf(env.DB, report.id),
    personOf(env.DB, report.reported),
    farmNameOf(env.DB, report.farm),
    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM reports WHERE reported_id = ? AND id != ? AND received_at <= ?',
    )
      .bind(report.reported, report.id, report.receivedAt)
      .first<{ n: number }>(),
    blockedByCount(env, report.reported),
  ]);
  const context = (report.context ?? [])
    .flatMap((e) => {
      const parsed = EventEnvelope.safeParse(e);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, LIMITS.reportContext);
  const createdAt = reported?.createdAt ?? null;
  return {
    report: report.id,
    status: report.status,
    category: report.category,
    urgent: report.urgent,
    receivedAt: report.receivedAt,
    dueAt: report.dueAt,
    farm: report.farm,
    farmName,
    reported: { person: report.reported, name: reported?.name ?? null },
    reportedSeq: report.seq,
    reasons: filings.map((f) => f.reason).slice(0, LIMITS.members),
    notes: filings
      .flatMap((f) => (f.note === null || f.note.trim() === '' ? [] : [f.note]))
      .slice(0, LIMITS.members),
    context,
    signals: {
      earlierReports: earlier?.n ?? 0,
      accountAgeDays: createdAt === null ? 0 : Math.max(0, Math.floor((now - createdAt) / DAY_MS)),
      aimedAt: report.aimedAt,
      blockedBy,
      suggestedRule: report.suggestedRule,
    },
  };
}
