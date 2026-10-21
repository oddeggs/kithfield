import {
  DisplayName,
  EventEnvelope,
  LIMITS,
  PersonId,
  type QueuePage,
  type QueueQuery,
  type QueueRow,
  type ReportDetail,
  Species,
} from '@kithfield/contracts';

import { blockerCount } from '../auth';
import type { Bindings } from '../env';
import { auditStatement } from './audit';
import type { Moderator } from './moderator';
import { farmNameOf, filingsOf, loadReport, namesOf, personOf, toReport } from './store';

/*
 * The queue (child safety first, then the other urgent reports, then the rest; oldest first within
 * each), a single report, and claiming one.
 */

const PAGE = 100;
const DAY_MS = 24 * 60 * 60_000;

type QueueRaw = Parameters<typeof toReport>[0] & {
  reporters: number;
  farm_kind: string | null;
  farm_name: string | null;
  first_note: string | null;
  earlier: number;
  reported_name: string | null;
  aimed_name: string | null;
};

/** A name as the desk shows it, or null when there is none to show. */
const shownName = (name: string | null | undefined): string | null => {
  const parsed = DisplayName.safeParse(name);
  return parsed.success ? parsed.data : null;
};

/** Words as the desk quotes them: cut to `max`, null when there are none. */
const quoted = (words: string | null, max: number): string | null =>
  words === null || words.trim() === '' ? null : words.slice(0, max);

/** Where a report stands in the queue: child safety 2, other urgent reports 1, the rest 0. */
const RANK_SQL = `(CASE WHEN r.category = 'child_safety' THEN 2 WHEN r.urgent = 1 THEN 1 ELSE 0 END)`;
const rankOf = (row: QueueRow) => (row.category === 'child_safety' ? 2 : row.urgent ? 1 : 0);

/** Keyset cursor over (rank desc, received asc, id asc). */
const encodeCursor = (row: QueueRow) => `${rankOf(row)}.${row.receivedAt}.${row.report}`;
const decodeCursor = (cursor: string | undefined) => {
  const match =
    cursor === undefined ? null : /^([012])\.(\d+)\.([A-Za-z0-9_-]{1,64})$/.exec(cursor);
  return match === null
    ? null
    : { rank: Number(match[1]), at: Number(match[2]), id: match[3] ?? '' };
};

/**
 * `GET /admin/v1/queue`: every open report, child safety first, then the other urgent reports,
 * then the rest, oldest first within each.
 */
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
      `(${RANK_SQL} < ? OR (${RANK_SQL} = ? AND (r.received_at > ? OR (r.received_at = ? AND r.id > ?))))`,
    );
    params.push(after.rank, after.rank, after.at, after.at, after.id);
  }
  const { results } = await db
    .prepare(
      `SELECT r.*, f.kind AS farm_kind, f.name AS farm_name,
         (SELECT COUNT(*) FROM report_filings x WHERE x.report_id = r.id) AS reporters,
         (SELECT x.note FROM report_filings x
          WHERE x.report_id = r.id AND x.note IS NOT NULL AND trim(x.note) != ''
          ORDER BY x.filed_at, x.reporter_id LIMIT 1) AS first_note,
         (SELECT COUNT(*) FROM reports e
          WHERE e.reported_id = r.reported_id AND e.id != r.id AND e.received_at <= r.received_at)
           AS earlier,
         pr.display_name AS reported_name, pa.display_name AS aimed_name
       FROM reports r LEFT JOIN farms f ON f.id = r.farm_id
         LEFT JOIN people pr ON pr.id = r.reported_id
         LEFT JOIN people pa ON pa.id = r.aimed_at
       WHERE ${where.join(' AND ')}
       ORDER BY ${RANK_SQL} DESC, r.received_at ASC, r.id ASC LIMIT ?`,
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
      preview: {
        excerpt: quoted(report.excerpt, 300),
        note: quoted(raw.first_note, 500),
        reportedName: shownName(raw.reported_name),
        aimedAtName: report.aimedAt === null ? null : shownName(raw.aimed_name),
        earlierReports: raw.earlier,
      },
    };
  });
  const last = rows.at(-1);
  return { rows, cursor: results.length > PAGE && last !== undefined ? encodeCursor(last) : null };
}

const PEOPLE_MAX = LIMITS.reportContext + LIMITS.members;

/**
 * Everyone a report's context names (authors, whoever a message is sent to or mentions), with the
 * reported person and whoever it was aimed at first.
 */
function peopleIn(
  reported: string,
  aimedAt: string | null,
  context: readonly EventEnvelope[],
): string[] {
  const out = new Set<string>([reported]);
  const add = (value: unknown) => {
    if (out.size < PEOPLE_MAX && PersonId.safeParse(value).success) out.add(value as string);
  };
  add(aimedAt);
  for (const event of context) {
    add(event.actor);
    const payload =
      typeof event.payload === 'object' && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : {};
    add(payload['to']);
    const mentions = payload['mentions'];
    if (Array.isArray(mentions)) for (const m of mentions) add(m);
  }
  return [...out];
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
    blockerCount(env.DB, report.reported),
  ]);
  const context = (report.context ?? [])
    .flatMap((e) => {
      const parsed = EventEnvelope.safeParse(e);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, LIMITS.reportContext);
  const people = peopleIn(report.reported, report.aimedAt, context);
  const named = await namesOf(env.DB, people);
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
    people: people.map((person) => {
      const known = named.get(person);
      const species = Species.safeParse(known?.species);
      return {
        person,
        name: shownName(known?.name),
        species: species.success ? species.data : null,
      };
    }),
    reporters: filings.map((f) => f.reporter).slice(0, LIMITS.members),
    signals: {
      earlierReports: earlier?.n ?? 0,
      accountAgeDays: createdAt === null ? 0 : Math.max(0, Math.floor((now - createdAt) / DAY_MS)),
      aimedAt: report.aimedAt,
      blockedBy,
      suggestedRule: report.suggestedRule,
    },
  };
}
