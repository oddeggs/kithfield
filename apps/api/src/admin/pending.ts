import {
  DisplayName,
  ModerationAction,
  type PendingAction,
  type PendingActionPage,
} from '@kithfield/contracts';

import { ruleFromDb } from './ids';

/*
 * Decisions waiting for a second moderator: a removal from Kithfield stays `awaiting_second`
 * until a senior moderator who didn't ask for it agrees (`POST /admin/v1/actions/:id/approve`).
 */

const PAGE = 100;

interface PendingRaw {
  id: string;
  report_id: string;
  action: string;
  person_id: string;
  display_name: string | null;
  moderator_id: string;
  moderator_name: string | null;
  created_at: number;
  rule: string | null;
  note: string;
}

/** Keyset cursor over (asked at asc, id asc). */
const encodeCursor = (row: PendingAction) => `${row.askedAt}.${row.action}`;
const decodeCursor = (cursor: string | undefined) => {
  const match = cursor === undefined ? null : /^(\d+)\.([A-Za-z0-9_-]{1,64})$/.exec(cursor);
  return match === null ? null : { at: Number(match[1]), id: match[2] ?? '' };
};

const toPending = (raw: PendingRaw): PendingAction | null => {
  const decision = ModerationAction.safeParse(raw.action);
  if (!decision.success) return null;
  const name = DisplayName.safeParse(raw.display_name);
  return {
    action: raw.id,
    report: raw.report_id,
    decision: decision.data,
    person: raw.person_id,
    name: name.success ? name.data : null,
    askedBy: raw.moderator_id,
    askedByName: (raw.moderator_name ?? raw.moderator_id).slice(0, 64),
    askedAt: raw.created_at,
    rule: ruleFromDb(raw.rule),
    note: raw.note.slice(0, 1000),
  };
};

/** `GET /admin/v1/actions?status=awaiting_second`: decisions waiting for agreement, oldest first. */
export async function pendingActions(
  db: D1Database,
  query: { cursor?: string | undefined },
): Promise<PendingActionPage> {
  const after = decodeCursor(query.cursor);
  const where = ["a.status = 'awaiting_second'"];
  const params: (string | number)[] = [];
  if (after !== null) {
    where.push('(a.created_at > ? OR (a.created_at = ? AND a.id > ?))');
    params.push(after.at, after.at, after.id);
  }
  const { results } = await db
    .prepare(
      `SELECT a.id, a.report_id, a.action, a.person_id, p.display_name, a.moderator_id,
         m.name AS moderator_name, a.created_at, a.rule, a.note
       FROM moderation_actions a
         LEFT JOIN people p ON p.id = a.person_id
         LEFT JOIN moderators m ON m.id = a.moderator_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at ASC, a.id ASC LIMIT ?`,
    )
    .bind(...params, PAGE + 1)
    .all<PendingRaw>();
  const rows = results.slice(0, PAGE).flatMap((raw) => {
    const row = toPending(raw);
    return row === null ? [] : [row];
  });
  const last = rows.at(-1);
  return { rows, cursor: results.length > PAGE && last !== undefined ? encodeCursor(last) : null };
}
