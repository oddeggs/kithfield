import type {
  AccountOutcome,
  ActionRequest,
  ActionResponse,
  ModerationAction,
  RuleRef,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { auditStatement } from './audit';
import { applyEffects, type Effects } from './effects';
import { mintId, ruleFromDb, ruleToDb } from './ids';
import type { Moderator } from './moderator';
import { leaveNote } from './notes';
import { farmNameOf, filingsOf, loadReport, type ReportRow } from './store';
import { dueAfter } from './signals';

/*
 * A moderator's decision on a report. Every decision is written to `moderation_actions` and the
 * audit log; removal from Kithfield waits for a second, senior moderator. The reporters hear the
 * outcome for the item, the member hears which rule, both as quiet notes.
 */

export type DecideOutcome =
  | { ok: true; response: ActionResponse }
  | { ok: false; status: 403 | 404 | 409; code: 'forbidden' | 'not_found' | 'conflict' };

/** Decisions that close the report. Escalations and freezes keep it in the queue. */
const CLOSES: ReadonlySet<ModerationAction> = new Set([
  'dismiss',
  'remove',
  'remove_warn',
  'pause_7d',
  'remove_from_farm',
  'remove_from_kithfield',
]);

/** What the member is told happened to their account, for the decisions they hear about. */
const ACCOUNT: Partial<Record<ModerationAction, AccountOutcome>> = {
  remove: 'unchanged',
  remove_warn: 'warned',
  pause_7d: 'paused',
  remove_from_farm: 'removed_from_farm',
};

/** Decisions about the reported item itself, made once per report. */
const ITEM_VERDICTS: ReadonlySet<ModerationAction> = new Set(['dismiss', 'remove', 'remove_warn']);

/** Roles that may agree to a removal from Kithfield. */
const APPROVERS = new Set(['senior', 'legal']);

interface Stored {
  readonly id: string;
  readonly action: ModerationAction;
  readonly rule: RuleRef | null;
  readonly note: string;
  readonly tellReporters: boolean;
  readonly tellMember: boolean;
}

const reportStatus = (action: ModerationAction) =>
  action === 'dismiss' ? 'dismissed' : CLOSES.has(action) ? 'actioned' : 'escalated';

/** The report's own row after a decision: status, first action, escalation, closing. */
function reportUpdate(env: Bindings, report: ReportRow, action: ModerationAction, now: number) {
  if (action === 'freeze_farm' || action === 'unfreeze_farm') {
    return env.DB.prepare(
      'UPDATE reports SET first_action_at = COALESCE(first_action_at, ?) WHERE id = ?',
    ).bind(now, report.id);
  }
  if (action === 'escalate_urgent') {
    return env.DB.prepare(
      `UPDATE reports SET status = 'escalated', urgent = 1, claimed_by = NULL,
         due_at = MIN(due_at, ?), first_action_at = COALESCE(first_action_at, ?) WHERE id = ?`,
    ).bind(now + dueAfter(true), now, report.id);
  }
  const closes = CLOSES.has(action);
  return env.DB.prepare(
    `UPDATE reports SET status = ?, claimed_by = CASE WHEN ? THEN claimed_by ELSE NULL END,
       first_action_at = COALESCE(first_action_at, ?),
       closed_at = CASE WHEN ? THEN COALESCE(closed_at, ?) ELSE closed_at END
     WHERE id = ?`,
  ).bind(reportStatus(action), closes ? 1 : 0, now, closes ? 1 : 0, now, report.id);
}

async function tellPeople(
  env: Bindings,
  report: ReportRow,
  action: Stored,
  effects: Effects,
  now: number,
): Promise<void> {
  if (!CLOSES.has(action.action)) return;
  const farmName = await farmNameOf(env.DB, report.farm);
  if (action.tellReporters) {
    const outcome = action.action === 'dismiss' ? 'kept' : 'removed';
    const filings = await filingsOf(env.DB, report.id);
    for (const filing of filings) {
      await leaveNote(
        env,
        filing.reporter,
        {
          note: 'report_answered',
          report: report.id,
          farm: report.farm,
          farmName,
          about: report.reported,
          kind: report.kind,
          eventAt: report.eventAt,
          outcome,
        },
        now,
      );
    }
  }
  const account = ACCOUNT[action.action];
  if (action.tellMember && account !== undefined && action.rule !== null) {
    await leaveNote(
      env,
      report.reported,
      {
        note: 'content_removed',
        action: action.id,
        farm: report.farm,
        farmName,
        kind: report.kind,
        eventAt: report.eventAt,
        rule: action.rule,
        excerpt: effects.removedEvent ? report.excerpt : null,
        account,
        pausedUntil: effects.pausedUntil,
        appealable: true,
      },
      now,
    );
  }
}

/** Runs a decision's effects, then records them on the report and tells people. */
async function carryOut(
  env: Bindings,
  report: ReportRow,
  action: Stored,
  now: number,
): Promise<boolean> {
  const done = await applyEffects(env, report, action, now);
  if (!done.ok) return false;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE moderation_actions SET status = 'applied', applied_at = ?, removed_event = ?,
         paused_until = ? WHERE id = ?`,
    ).bind(now, done.effects.removedEvent ? 1 : 0, done.effects.pausedUntil, action.id),
    reportUpdate(env, report, action.action, now),
  ]);
  await tellPeople(env, report, action, done.effects, now);
  return true;
}

/**
 * Closes the report if it is still open, in one statement, so only one decision can. A verdict
 * on the item also needs no removal from Kithfield to be waiting. True when this call closed it.
 */
async function claimClose(
  env: Bindings,
  report: string,
  now: number,
  verdict: boolean,
): Promise<boolean> {
  const waiting = verdict
    ? ` AND NOT EXISTS (SELECT 1 FROM moderation_actions
         WHERE report_id = ? AND status = 'awaiting_second')`
    : '';
  const result = await env.DB.prepare(
    `UPDATE reports SET closed_at = ? WHERE id = ? AND closed_at IS NULL${waiting}`,
  )
    .bind(...(verdict ? [now, report, report] : [now, report]))
    .run();
  return result.meta.changes === 1;
}

/** `POST /admin/v1/reports/:id/actions`. */
export async function decide(
  env: Bindings,
  moderator: Moderator,
  reportId: string,
  req: ActionRequest,
  now: number,
): Promise<DecideOutcome> {
  const report = await loadReport(env.DB, reportId);
  if (report === null) return { ok: false, status: 404, code: 'not_found' };
  // The verdict on the item claims the close first, so two at the same moment can't both land,
  // and none lands while a removal from Kithfield waits for its second moderator. A closed report
  // can still get an account decision (from the member's record).
  let claimedClose = false;
  if (ITEM_VERDICTS.has(req.action)) {
    if (!(await claimClose(env, report.id, now, true))) {
      return { ok: false, status: 409, code: 'conflict' };
    }
    claimedClose = true;
  } else if (CLOSES.has(req.action) && req.action !== 'remove_from_kithfield') {
    claimedClose = await claimClose(env, report.id, now, false);
  }
  const stored: Stored = {
    id: mintId('A'),
    action: req.action,
    rule: req.rule,
    note: req.note,
    tellReporters: req.tellReporters,
    tellMember: req.tellMember,
  };
  const awaiting = req.action === 'remove_from_kithfield';
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO moderation_actions (id, report_id, moderator_id, action, rule, note,
         tell_reporters, tell_member, status, person_id, farm_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      stored.id,
      report.id,
      moderator.id,
      stored.action,
      ruleToDb(stored.rule),
      stored.note,
      stored.tellReporters ? 1 : 0,
      stored.tellMember ? 1 : 0,
      awaiting ? 'awaiting_second' : 'applied',
      report.reported,
      report.farm,
      now,
    ),
    auditStatement(env.DB, {
      at: now,
      by: moderator.id,
      what: stored.action,
      item: report.id,
      rule: stored.rule,
      reason: stored.note,
    }),
    ...(awaiting
      ? [
          env.DB.prepare(
            'UPDATE reports SET first_action_at = COALESCE(first_action_at, ?) WHERE id = ?',
          ).bind(now, report.id),
        ]
      : []),
  ]);
  if (awaiting) return { ok: true, response: { action: stored.id, status: 'awaiting_second' } };
  if (!(await carryOut(env, report, stored, now))) {
    // Nothing happened on the farm: the decision stays in the log, marked as not carried out,
    // and the report opens again.
    await env.DB.batch([
      env.DB.prepare("UPDATE moderation_actions SET status = 'undone' WHERE id = ?").bind(
        stored.id,
      ),
      ...(claimedClose
        ? [
            env.DB.prepare(
              'UPDATE reports SET closed_at = NULL WHERE id = ? AND closed_at = ?',
            ).bind(report.id, now),
          ]
        : []),
    ]);
    return { ok: false, status: 409, code: 'conflict' };
  }
  return { ok: true, response: { action: stored.id, status: 'applied' } };
}

interface ActionRow {
  id: string;
  report_id: string;
  moderator_id: string;
  action: string;
  rule: string | null;
  note: string;
  tell_reporters: number;
  tell_member: number;
  status: string;
}

/** `POST /admin/v1/actions/:id/approve`: a second, senior moderator agrees to a removal. */
export async function approve(
  env: Bindings,
  moderator: Moderator,
  actionId: string,
  now: number,
): Promise<DecideOutcome> {
  const row = await env.DB.prepare('SELECT * FROM moderation_actions WHERE id = ?')
    .bind(actionId)
    .first<ActionRow>();
  if (row === null) return { ok: false, status: 404, code: 'not_found' };
  if (row.status !== 'awaiting_second') return { ok: false, status: 409, code: 'conflict' };
  if (row.moderator_id === moderator.id || !APPROVERS.has(moderator.role)) {
    return { ok: false, status: 403, code: 'forbidden' };
  }
  const report = await loadReport(env.DB, row.report_id);
  if (report === null) return { ok: false, status: 404, code: 'not_found' };
  // Someone found no rule broken: a removal can't follow on the same report.
  if (report.status === 'dismissed') return { ok: false, status: 409, code: 'conflict' };
  // Only one agreement counts: the first to claim it carries the removal out.
  const claim = await env.DB.prepare(
    `UPDATE moderation_actions SET approved_by = ?
     WHERE id = ? AND status = 'awaiting_second' AND approved_by IS NULL`,
  )
    .bind(moderator.id, row.id)
    .run();
  if (claim.meta.changes !== 1) return { ok: false, status: 409, code: 'conflict' };
  const stored: Stored = {
    id: row.id,
    action: row.action as ModerationAction,
    rule: ruleFromDb(row.rule),
    note: row.note,
    tellReporters: row.tell_reporters === 1,
    tellMember: row.tell_member === 1,
  };
  await auditStatement(env.DB, {
    at: now,
    by: moderator.id,
    what: stored.action,
    item: report.id,
    rule: stored.rule,
    reason: null,
  }).run();
  if (!(await carryOut(env, report, stored, now))) {
    return { ok: false, status: 409, code: 'conflict' };
  }
  return { ok: true, response: { action: row.id, status: 'applied' } };
}
