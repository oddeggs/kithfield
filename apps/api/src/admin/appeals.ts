import type {
  AppealDecision,
  AppealDetail,
  AppealPage,
  AppealRow,
  AppealStatus,
  ModerationAction,
  ReportCategory,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { auditStatement } from './audit';
import { undoEffects } from './effects';
import { mintId, ruleFromDb } from './ids';
import type { Moderator } from './moderator';
import { leaveNote } from './notes';
import { loadReport, touchedBy } from './store';

/*
 * Appeals: a member asks for another look at a decision about them. It is assigned to, and only
 * decided by, a moderator who didn't touch the report. Undoing a removal restores the event.
 */

/** Decisions that leave nothing on the member to appeal. */
const NOT_APPEALABLE: ReadonlySet<ModerationAction> = new Set([
  'dismiss',
  'escalate_urgent',
  'escalate_legal',
  'freeze_farm',
  'unfreeze_farm',
]);

export type AppealIntake =
  { ok: true; appeal: string } | { ok: false; status: 404 | 409; code: 'not_found' | 'conflict' };

/** Picks the moderator with the fewest open appeals among those who didn't touch the report. */
async function pickReviewer(db: D1Database, report: string): Promise<string | null> {
  const touched = await touchedBy(db, report);
  const { results } = await db
    .prepare(
      `SELECT m.id, (SELECT COUNT(*) FROM appeals p WHERE p.reviewer_id = m.id AND p.status = 'open') AS load
       FROM moderators m ORDER BY load, m.first_seen_at`,
    )
    .all<{ id: string; load: number }>();
  return results.find((m) => !touched.has(m.id))?.id ?? null;
}

/** `POST /v1/appeals`: only the person a decision was about, once per decision. */
export async function takeAppeal(
  env: Bindings,
  person: string,
  req: { action: string; text: string },
  now: number,
): Promise<AppealIntake> {
  const action = await env.DB.prepare(
    "SELECT id, report_id, action FROM moderation_actions WHERE id = ? AND person_id = ? AND status = 'applied'",
  )
    .bind(req.action, person)
    .first<{ id: string; report_id: string; action: string }>();
  if (action === null || NOT_APPEALABLE.has(action.action as ModerationAction)) {
    return { ok: false, status: 404, code: 'not_found' };
  }
  const id = mintId('P');
  const reviewer = await pickReviewer(env.DB, action.report_id);
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO appeals (id, person_id, action_id, text, status, reviewer_id, sent_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`,
  )
    .bind(id, person, action.id, req.text, reviewer, now)
    .run();
  if (inserted.meta.changes === 0) return { ok: false, status: 409, code: 'conflict' };
  return { ok: true, appeal: id };
}

interface AppealRaw {
  id: string;
  person_id: string;
  name: string | null;
  action_id: string;
  action: string;
  category: string;
  report_id: string;
  sent_at: number;
  status: string;
  reviewer_id: string | null;
  text: string;
  moderator_id: string;
  moderator_name: string | null;
  decided: number;
  rule: string | null;
  excerpt: string | null;
}

const SELECT = `SELECT p.id, p.person_id, pe.display_name AS name, p.action_id, a.action,
    r.category, a.report_id, p.sent_at, p.status, p.reviewer_id, p.text, a.moderator_id,
    m.name AS moderator_name, COALESCE(a.applied_at, a.created_at) AS decided, a.rule, r.excerpt
  FROM appeals p
  JOIN moderation_actions a ON a.id = p.action_id
  JOIN reports r ON r.id = a.report_id
  LEFT JOIN people pe ON pe.id = p.person_id
  LEFT JOIN moderators m ON m.id = a.moderator_id`;

const toRow = (raw: AppealRaw): AppealRow => ({
  appeal: raw.id,
  person: raw.person_id,
  name: raw.name,
  action: raw.action_id,
  decision: raw.action as ModerationAction,
  category: raw.category as ReportCategory,
  report: raw.report_id,
  sentAt: raw.sent_at,
  status: raw.status as AppealStatus,
  reviewer: raw.reviewer_id,
  text: raw.text,
});

const PAGE = 100;

/** `GET /admin/v1/appeals?status=&cursor=`: open ones first, then newest. */
export async function appealPage(
  db: D1Database,
  query: { status?: AppealStatus | undefined; cursor?: string | undefined },
): Promise<AppealPage> {
  const offset =
    query.cursor !== undefined && /^\d{1,6}$/.test(query.cursor) ? Number(query.cursor) : 0;
  const where = query.status === undefined ? '' : 'WHERE p.status = ?';
  const { results } = await db
    .prepare(
      `${SELECT} ${where} ORDER BY CASE p.status WHEN 'open' THEN 0 ELSE 1 END, p.sent_at DESC, p.id
       LIMIT ? OFFSET ?`,
    )
    .bind(...(query.status === undefined ? [] : [query.status]), PAGE + 1, offset)
    .all<AppealRaw>();
  return {
    rows: results.slice(0, PAGE).map(toRow),
    cursor: results.length > PAGE ? String(offset + PAGE) : null,
  };
}

export type AppealRead =
  | { ok: true; appeal: AppealDetail; raw: AppealRaw }
  | { ok: false; status: 403 | 404; code: 'forbidden' | 'not_found' };

/** `GET /admin/v1/appeals/:id`: 403 for anyone who touched the report. */
export async function readAppeal(
  db: D1Database,
  moderator: Moderator,
  id: string,
): Promise<AppealRead> {
  const raw = await db.prepare(`${SELECT} WHERE p.id = ?`).bind(id).first<AppealRaw>();
  if (raw === null) return { ok: false, status: 404, code: 'not_found' };
  const touched = await touchedBy(db, raw.report_id);
  if (touched.has(moderator.id)) return { ok: false, status: 403, code: 'forbidden' };
  if (raw.reviewer_id === null) {
    // Nobody was free when it came in: the first eligible moderator to open it takes it.
    await db
      .prepare('UPDATE appeals SET reviewer_id = ? WHERE id = ? AND reviewer_id IS NULL')
      .bind(moderator.id, id)
      .run();
    raw.reviewer_id = moderator.id;
  }
  return {
    ok: true,
    raw,
    appeal: {
      ...toRow(raw),
      decidedBy: raw.moderator_id,
      decidedByName: (raw.moderator_name ?? raw.moderator_id).slice(0, 64),
      decidedAt: raw.decided,
      rule: ruleFromDb(raw.rule),
      excerpt: raw.excerpt,
    },
  };
}

export type AppealDecided =
  | { ok: true }
  | { ok: false; status: 403 | 404 | 409; code: 'forbidden' | 'not_found' | 'conflict' };

/** `POST /admin/v1/appeals/:id/decision`: keep the decision, or undo it and restore. */
export async function decideAppeal(
  env: Bindings,
  moderator: Moderator,
  id: string,
  decision: AppealDecision,
  now: number,
): Promise<AppealDecided> {
  const read = await readAppeal(env.DB, moderator, id);
  if (!read.ok) return read;
  const { raw } = read;
  if (raw.status !== 'open') return { ok: false, status: 409, code: 'conflict' };
  const undo = decision.outcome === 'undo';
  if (undo) {
    const report = await loadReport(env.DB, raw.report_id);
    const action = await env.DB.prepare('SELECT removed_event FROM moderation_actions WHERE id = ?')
      .bind(raw.action_id)
      .first<{ removed_event: number }>();
    if (report === null || action === null) return { ok: false, status: 404, code: 'not_found' };
    await undoEffects(
      env,
      report,
      {
        id: raw.action_id,
        action: raw.action as ModerationAction,
        removedEvent: action.removed_event === 1,
      },
      now,
    );
  }
  const status = undo ? 'undone' : 'kept';
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE appeals SET status = ?, reviewer_id = ?, reply = ?, decided_at = ? WHERE id = ? AND status = 'open'",
    ).bind(status, moderator.id, decision.reply, now, id),
    ...(undo
      ? [
          env.DB.prepare("UPDATE moderation_actions SET status = 'undone' WHERE id = ?").bind(
            raw.action_id,
          ),
        ]
      : []),
    auditStatement(env.DB, {
      at: now,
      by: moderator.id,
      what: undo ? 'appeal_undone' : 'appeal_kept',
      item: raw.report_id,
      rule: ruleFromDb(raw.rule),
      reason: decision.reply.slice(0, 1000),
    }),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) return { ok: false, status: 409, code: 'conflict' };
  await leaveNote(
    env,
    raw.person_id,
    {
      note: 'appeal_answered',
      appeal: id,
      outcome: undo ? 'undone' : 'kept',
      reply: decision.reply,
    },
    now,
  );
  return { ok: true };
}
