import {
  type EventEnvelope,
  type ReportCategory,
  type ReportReason,
  type ReportStatus,
  type RuleRef,
} from '@kithfield/contracts';

import { ruleFromDb } from './ids';

type AnyEventKind = EventEnvelope['kind'];

/* The safety desk's D1 rows, read into the shapes the routes work with. */

export interface ReportRow {
  readonly id: string;
  readonly farm: string;
  readonly reported: string;
  readonly seq: number | null;
  readonly kind: AnyEventKind | null;
  readonly eventAt: number | null;
  readonly category: ReportCategory;
  readonly urgent: boolean;
  readonly source: 'member' | 'link_reputation' | 'hash_match';
  readonly status: ReportStatus;
  readonly claimedBy: string | null;
  readonly aimedAt: string | null;
  readonly suggestedRule: RuleRef | null;
  readonly excerpt: string | null;
  readonly context: EventEnvelope[] | null;
  readonly receivedAt: number;
  readonly dueAt: number;
  readonly firstActionAt: number | null;
  readonly closedAt: number | null;
}

interface RawReport {
  id: string;
  farm_id: string;
  reported_id: string;
  seq: number | null;
  kind: string | null;
  event_at: number | null;
  category: string;
  urgent: number;
  source: string;
  status: string;
  claimed_by: string | null;
  aimed_at: string | null;
  suggested_rule: string | null;
  excerpt: string | null;
  context_json: string | null;
  received_at: number;
  due_at: number;
  first_action_at: number | null;
  closed_at: number | null;
}

const parseContext = (raw: string | null): EventEnvelope[] | null => {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as EventEnvelope[]) : null;
  } catch {
    return null;
  }
};

export const toReport = (raw: RawReport): ReportRow => ({
  id: raw.id,
  farm: raw.farm_id,
  reported: raw.reported_id,
  seq: raw.seq,
  kind: raw.kind,
  eventAt: raw.event_at,
  category: raw.category as ReportCategory,
  urgent: raw.urgent === 1,
  source: raw.source as ReportRow['source'],
  status: raw.status as ReportStatus,
  claimedBy: raw.claimed_by,
  aimedAt: raw.aimed_at,
  suggestedRule: ruleFromDb(raw.suggested_rule),
  excerpt: raw.excerpt,
  context: parseContext(raw.context_json),
  receivedAt: raw.received_at,
  dueAt: raw.due_at,
  firstActionAt: raw.first_action_at,
  closedAt: raw.closed_at,
});

export async function loadReport(db: D1Database, id: string): Promise<ReportRow | null> {
  const raw = await db.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<RawReport>();
  return raw === null ? null : toReport(raw);
}

/** The open case for an item, if one is open. */
export async function openReportFor(
  db: D1Database,
  item: { farm: string; reported: string; seq: number | null },
): Promise<ReportRow | null> {
  const raw = await db
    .prepare(
      `SELECT * FROM reports WHERE farm_id = ? AND reported_id = ? AND IFNULL(seq, 0) = ?
       AND closed_at IS NULL`,
    )
    .bind(item.farm, item.reported, item.seq ?? 0)
    .first<RawReport>();
  return raw === null ? null : toReport(raw);
}

export interface Filing {
  readonly reporter: string;
  readonly reason: ReportReason;
  readonly note: string | null;
  readonly alsoBlock: boolean;
  readonly filedAt: number;
}

export async function filingsOf(db: D1Database, report: string): Promise<Filing[]> {
  const { results } = await db
    .prepare(
      `SELECT reporter_id, reason, note, also_block, filed_at FROM report_filings
       WHERE report_id = ? ORDER BY filed_at, reporter_id`,
    )
    .bind(report)
    .all<{
      reporter_id: string;
      reason: string;
      note: string | null;
      also_block: number;
      filed_at: number;
    }>();
  return results.map((r) => ({
    reporter: r.reporter_id,
    reason: r.reason as ReportReason,
    note: r.note,
    alsoBlock: r.also_block === 1,
    filedAt: r.filed_at,
  }));
}

const speciesOf = (critter: string | null): string | null => {
  try {
    const parsed = critter === null ? null : (JSON.parse(critter) as { species?: unknown });
    return typeof parsed?.species === 'string' ? parsed.species : null;
  } catch {
    return null;
  }
};

/** Display names and critter species of several people at once; someone unknown is left out. */
export async function namesOf(
  db: D1Database,
  people: readonly string[],
): Promise<Map<string, { name: string | null; species: string | null }>> {
  const ids = [...new Set(people)].slice(0, 90);
  if (ids.length === 0) return new Map();
  const { results } = await db
    .prepare(
      `SELECT id, display_name, critter FROM people WHERE id IN (${ids.map(() => '?').join(', ')})`,
    )
    .bind(...ids)
    .all<{ id: string; display_name: string | null; critter: string | null }>();
  return new Map(
    results.map((r) => [r.id, { name: r.display_name, species: speciesOf(r.critter) }]),
  );
}

/** A person's display name and critter species, as friends see them. */
export async function personOf(
  db: D1Database,
  person: string,
): Promise<{ name: string | null; species: string | null; createdAt: number | null } | null> {
  const row = await db
    .prepare('SELECT display_name, critter, created_at FROM people WHERE id = ?')
    .bind(person)
    .first<{ display_name: string | null; critter: string | null; created_at: string | number }>();
  if (row === null) return null;
  const species = speciesOf(row.critter);
  const created =
    typeof row.created_at === 'number' ? row.created_at : Date.parse(String(row.created_at));
  return {
    name: row.display_name,
    species,
    createdAt: Number.isFinite(created) ? created : null,
  };
}

/** A farm's name, or null for a visit (and for a farm D1 doesn't know). */
export async function farmNameOf(db: D1Database, farm: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT kind, name FROM farms WHERE id = ?')
    .bind(farm)
    .first<{ kind: string; name: string | null }>();
  return row === null || row.kind === 'visit' ? null : row.name;
}

/** The farms a person lives on now. */
export async function farmsOf(
  db: D1Database,
  person: string,
): Promise<{ farm: string; name: string | null; kind: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.name, f.kind FROM memberships m JOIN farms f ON f.id = m.farm_id
       WHERE m.person_id = ? AND m.left_at IS NULL ORDER BY m.joined_at`,
    )
    .bind(person)
    .all<{ id: string; name: string | null; kind: string }>();
  return results.map((r) => ({
    farm: r.id,
    name: r.kind === 'visit' ? null : r.name,
    kind: r.kind,
  }));
}

/**
 * Everyone at the desk who made or agreed to a decision on a report. Opening it doesn't count:
 * an appeal goes to someone who wasn't part of a decision.
 */
export async function involvedIn(db: D1Database, report: string): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT moderator_id AS id FROM moderation_actions WHERE report_id = ?
       UNION SELECT approved_by FROM moderation_actions WHERE report_id = ? AND approved_by IS NOT NULL`,
    )
    .bind(report, report)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}
