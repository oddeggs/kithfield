import type { AuditEntry, AuditPage, RuleRef } from '@kithfield/contracts';

import { mintId, ruleFromDb, ruleToDb } from './ids';

/* The append-only audit log: every look and every decision, with who, when and why. */

export type AuditWhat = AuditEntry['what'];

export interface AuditWrite {
  readonly at: number;
  /** Null for the system. */
  readonly by: string | null;
  readonly what: AuditWhat;
  readonly item: string;
  readonly rule?: RuleRef | null;
  readonly reason?: string | null;
}

/** The statement that writes one entry, to batch with the change it records. */
export const auditStatement = (db: D1Database, entry: AuditWrite): D1PreparedStatement =>
  db
    .prepare(
      'INSERT INTO audit_log (id, at, moderator_id, what, item, rule, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      mintId('L'),
      entry.at,
      entry.by,
      entry.what,
      entry.item,
      ruleToDb(entry.rule ?? null),
      entry.reason ?? null,
    );

export const writeAudit = async (db: D1Database, entry: AuditWrite): Promise<void> => {
  await auditStatement(db, entry).run();
};

interface AuditRow {
  rowid: number;
  id: string;
  at: number;
  moderator_id: string | null;
  name: string | null;
  what: string;
  item: string;
  rule: string | null;
  reason: string | null;
}

const PAGE = 100;

const toEntry = (row: AuditRow): AuditEntry => ({
  id: row.id,
  at: row.at,
  by: row.moderator_id,
  byName: row.moderator_id === null ? null : (row.name ?? row.moderator_id),
  what: row.what as AuditEntry['what'],
  item: row.item,
  rule: ruleFromDb(row.rule),
  reason: row.reason === null || row.reason.trim() === '' ? null : row.reason.slice(0, 1000),
});

const SELECT = `SELECT a.rowid AS rowid, a.id, a.at, a.moderator_id, m.name, a.what, a.item, a.rule, a.reason
  FROM audit_log a LEFT JOIN moderators m ON m.id = a.moderator_id`;

/** Keyset cursors over (at, rowid), newest first: rowid keeps entries of one instant in order. */
const encodeCursor = (row: { at: number; rowid: number }) => `${row.at}.${row.rowid}`;
const decodeCursor = (cursor: string | undefined): { at: number; rowid: number } | null => {
  const match = cursor === undefined ? null : /^(\d+)\.(\d+)$/.exec(cursor);
  return match === null ? null : { at: Number(match[1]), rowid: Number(match[2]) };
};

/** `GET /admin/v1/audit?before=&cursor=`: newest first, at most 100 a page. */
export async function auditPage(
  db: D1Database,
  query: { before?: number | undefined; cursor?: string | undefined },
): Promise<AuditPage> {
  const after = decodeCursor(query.cursor);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (query.before !== undefined) {
    where.push('a.at < ?');
    params.push(query.before);
  }
  if (after !== null) {
    where.push('(a.at < ? OR (a.at = ? AND a.rowid < ?))');
    params.push(after.at, after.at, after.rowid);
  }
  const sql = `${SELECT} ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.at DESC, a.rowid DESC LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...params, PAGE + 1)
    .all<AuditRow>();
  const rows = results.slice(0, PAGE);
  const last = rows.at(-1);
  return {
    entries: rows.map(toEntry),
    cursor: results.length > PAGE && last !== undefined ? encodeCursor(last) : null,
  };
}

/** The quarter `2026-Q4` as [start, end) in epoch ms (UTC); null when it isn't one. */
export function quarterRange(quarter: string): [number, number] | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (match === null) return null;
  const year = Number(match[1]);
  const q = Number(match[2]);
  return [Date.UTC(year, (q - 1) * 3, 1), Date.UTC(year, q * 3, 1)];
}

/** The quarter an instant falls in, `2026-Q4`. */
export const quarterOf = (at: number): string => {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
};

const csvCell = (value: string | number | null): string => {
  if (value === null) return '';
  const text = String(value);
  // A leading formula character is neutralised so a spreadsheet never runs a cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** `GET /admin/v1/audit.csv?quarter=`: one quarter of the log, oldest first. */
export async function auditCsv(db: D1Database, range: [number, number]): Promise<string> {
  const { results } = await db
    .prepare(`${SELECT} WHERE a.at >= ? AND a.at < ? ORDER BY a.at, a.rowid`)
    .bind(range[0], range[1])
    .all<AuditRow>();
  const lines = [['id', 'at', 'by', 'what', 'item', 'rule', 'reason'].join(',')];
  for (const row of results) {
    const entry = toEntry(row);
    lines.push(
      [
        entry.id,
        new Date(entry.at).toISOString(),
        entry.byName ?? 'system',
        entry.what,
        entry.item,
        entry.rule === null ? null : String(entry.rule),
        entry.reason,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
