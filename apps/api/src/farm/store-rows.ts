import type { EventEnvelope, EventKind, RejectReason } from '@kithfield/contracts';

/* The farm object's SQLite tables and how their rows read. */

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY,
    op_id TEXT NOT NULL UNIQUE,
    at INTEGER NOT NULL,
    day TEXT,
    actor TEXT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    rules_version INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS events_by_actor ON events (actor, seq)',
  'CREATE INDEX IF NOT EXISTS events_by_kind ON events (kind, seq)',
  'CREATE INDEX IF NOT EXISTS events_by_kind_actor ON events (kind, actor, at)',
  'CREATE TABLE IF NOT EXISTS rejections (op_id TEXT PRIMARY KEY, reason TEXT NOT NULL, at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL, state TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS timers (key TEXT PRIMARY KEY, due INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS held (seq INTEGER PRIMARY KEY, payload TEXT NOT NULL, at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS aliases (from_person TEXT PRIMARY KEY, into_person TEXT NOT NULL)',
  // Phones that hold less than `below` take a snapshot: the farm's state changed outside the log.
  'CREATE TABLE IF NOT EXISTS resync (id INTEGER PRIMARY KEY CHECK (id = 1), below INTEGER NOT NULL)',
  // Committed events whose news hasn't reached every member's cottage yet.
  // `attempts` failed so far; tried again from `next_at`; given up a day after `first_at`.
  `CREATE TABLE IF NOT EXISTS deliveries (
    seq INTEGER PRIMARY KEY, first_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    next_at INTEGER NOT NULL
  )`,
  // A trade's second half, written on the visitor's own farm, until it lands.
  `CREATE TABLE IF NOT EXISTS trade_halves (
    op_id TEXT PRIMARY KEY, other_farm TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL
  )`,
  // Media an account deletion tombstoned and still has to delete from R2; gone once deleted.
  'CREATE TABLE IF NOT EXISTS media_owed (key TEXT PRIMARY KEY)',
  "CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5 (body, tokenize = 'unicode61 remove_diacritics 2')",
];

/** `actor IN (…)` for a person and the ids merged into them. */
export const actorIn = (ids: readonly string[]) => `actor IN (${ids.map(() => '?').join(',')})`;

export type EventRow = {
  seq: number;
  op_id: string;
  at: number;
  day: string | null;
  actor: string | null;
  kind: string;
  payload: string;
  rules_version: number;
};

export const envelopeOf = (row: EventRow): EventEnvelope => ({
  seq: row.seq,
  opId: row.op_id,
  at: row.at,
  ...(row.day === null ? {} : { day: row.day }),
  actor: row.actor,
  kind: row.kind,
  payload: JSON.parse(row.payload) as unknown,
  rulesVersion: row.rules_version,
});

export type Outcome = { seq: number } | { reason: RejectReason };

export type Timer = { key: string; due: number };

export type TradeHalf = { opId: string; otherFarm: string; actor: string; payload: unknown };

export type SearchHit = {
  seq: number;
  at: number;
  actor: string | null;
  kind: string;
  snippet: string;
};

export const kindFilter = (kinds: readonly EventKind[] | undefined) =>
  kinds === undefined
    ? { sql: '', args: [] }
    : { sql: ` AND kind IN (${kinds.map(() => '?').join(',')})`, args: [...kinds] };
