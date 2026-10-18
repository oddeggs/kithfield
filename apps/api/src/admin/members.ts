import {
  type MemberRecord,
  type ModerationAction,
  ReportCategory,
  Species,
} from '@kithfield/contracts';

import { blockerCount } from '../auth';
import type { Bindings } from '../env';
import { ruleFromDb } from './ids';
import { farmsOf, personOf } from './store';

/*
 * A member's record: safety history only (reports about them, decisions, appeals), never their
 * other chats. Warnings fade after 6 months.
 */

export const WARNING_FADES_MS = 182 * 24 * 60 * 60_000;
const HISTORY_MAX = 500;

type Entry = MemberRecord['history'][number];

const categoryOf = (raw: string | null): Entry['category'] => {
  const parsed = ReportCategory.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export async function memberRecord(
  env: Bindings,
  person: string,
  now: number,
): Promise<MemberRecord | null> {
  const db = env.DB;
  const [who, farms, reports, actions, appeals, made, blockedBy] = await Promise.all([
    personOf(db, person),
    farmsOf(db, person),
    db
      .prepare(
        `SELECT id, received_at, category, farm_id FROM reports WHERE reported_id = ?
         ORDER BY received_at`,
      )
      .bind(person)
      .all<{ id: string; received_at: number; category: string; farm_id: string }>(),
    db
      .prepare(
        `SELECT a.id, a.report_id, a.moderator_id, a.action, a.rule, a.status, a.created_at,
           a.applied_at, a.paused_until, a.farm_id, r.category
         FROM moderation_actions a LEFT JOIN reports r ON r.id = a.report_id
         WHERE a.person_id = ? AND a.status IN ('applied', 'undone', 'awaiting_second')
         ORDER BY a.created_at`,
      )
      .bind(person)
      .all<{
        id: string;
        report_id: string;
        moderator_id: string;
        action: string;
        rule: string | null;
        status: string;
        created_at: number;
        applied_at: number | null;
        paused_until: number | null;
        farm_id: string;
        category: string | null;
      }>(),
    db
      .prepare(
        `SELECT p.id, p.status, p.sent_at, a.report_id, a.action, a.farm_id, r.category
         FROM appeals p JOIN moderation_actions a ON a.id = p.action_id
           LEFT JOIN reports r ON r.id = a.report_id
         WHERE p.person_id = ?`,
      )
      .bind(person)
      .all<{
        id: string;
        status: string;
        sent_at: number;
        report_id: string;
        action: string;
        farm_id: string;
        category: string | null;
      }>(),
    db
      .prepare('SELECT COUNT(*) AS n FROM report_filings WHERE reporter_id = ?')
      .bind(person)
      .first<{ n: number }>(),
    blockerCount(env.DB, person),
  ]);
  if (who === null && reports.results.length === 0) return null;

  const history: Entry[] = [];
  if (who?.createdAt != null) {
    history.push({
      at: who.createdAt,
      what: 'joined',
      report: null,
      action: null,
      rule: null,
      by: null,
      category: null,
      farm: null,
    });
  }
  for (const r of reports.results) {
    history.push({
      at: r.received_at,
      what: 'reported',
      report: r.id,
      action: null,
      rule: null,
      by: null,
      category: categoryOf(r.category),
      farm: r.farm_id,
    });
  }
  let warnings = 0;
  let pausedUntil: number | null = null;
  for (const a of actions.results) {
    const action = a.action as ModerationAction;
    if (
      a.status === 'applied' &&
      action === 'remove_warn' &&
      (a.applied_at ?? 0) > now - WARNING_FADES_MS
    ) {
      warnings += 1;
    }
    if (a.status === 'applied' && a.paused_until !== null && a.paused_until > now) {
      pausedUntil = Math.max(pausedUntil ?? 0, a.paused_until);
    }
    history.push({
      at: a.applied_at ?? a.created_at,
      what: action === 'dismiss' ? 'dismissed' : 'actioned',
      report: a.report_id,
      action,
      rule: ruleFromDb(a.rule),
      by: a.moderator_id,
      category: categoryOf(a.category),
      farm: a.farm_id,
    });
  }
  for (const p of appeals.results) {
    history.push({
      at: p.sent_at,
      what: 'appealed',
      report: p.report_id,
      action: p.action as ModerationAction,
      rule: null,
      by: null,
      category: categoryOf(p.category),
      farm: p.farm_id,
    });
  }
  history.sort((x, y) => y.at - x.at);

  const species = Species.safeParse(who?.species);
  return {
    person,
    name: who?.name ?? null,
    species: species.success ? species.data : null,
    joinedAt: who?.createdAt ?? 0,
    farms: farms.map((f) => ({ farm: f.farm, name: f.name })).slice(0, 500),
    warnings,
    pausedUntil,
    history: history.slice(0, HISTORY_MAX),
    blockedBy,
    reportsMade: made?.n ?? 0,
    openAppeals: appeals.results.filter((p) => p.status === 'open').length,
  };
}
