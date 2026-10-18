import type {
  EventEnvelope,
  EventKind,
  FarmEvent,
  FarmState,
  OpId,
  RejectReason,
} from '@kithfield/contracts';

/*
 * The farm object's SQLite storage: the ordered log, the outcome of every write (rejections too),
 * the reducer's snapshot, the search index, the alarm timers, and payloads held back after a
 * safety removal in case an appeal restores them.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY,
    op_id TEXT NOT NULL UNIQUE,
    at INTEGER NOT NULL,
    actor TEXT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    rules_version INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS events_by_actor ON events (actor, seq)',
  'CREATE INDEX IF NOT EXISTS events_by_kind ON events (kind, seq)',
  'CREATE TABLE IF NOT EXISTS rejections (op_id TEXT PRIMARY KEY, reason TEXT NOT NULL, at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL, state TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS timers (key TEXT PRIMARY KEY, due INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS held (seq INTEGER PRIMARY KEY, payload TEXT NOT NULL)',
  "CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5 (body, tokenize = 'unicode61 remove_diacritics 2')",
];

type EventRow = {
  seq: number;
  op_id: string;
  at: number;
  actor: string | null;
  kind: string;
  payload: string;
  rules_version: number;
};

const envelopeOf = (row: EventRow): EventEnvelope => ({
  seq: row.seq,
  opId: row.op_id,
  at: row.at,
  actor: row.actor,
  kind: row.kind,
  payload: JSON.parse(row.payload) as unknown,
  rulesVersion: row.rules_version,
});

export type Outcome = { seq: number } | { reason: RejectReason };

export type Timer = { key: string; due: number };

export type SearchHit = {
  seq: number;
  at: number;
  actor: string | null;
  kind: string;
  snippet: string;
};

const kindFilter = (kinds: readonly EventKind[] | undefined) =>
  kinds === undefined
    ? { sql: '', args: [] }
    : { sql: ` AND kind IN (${kinds.map(() => '?').join(',')})`, args: [...kinds] };

export class FarmStore {
  constructor(private readonly sql: SqlStorage) {
    for (const statement of SCHEMA) sql.exec(statement);
  }

  head(): number {
    return (
      this.sql.exec<{ seq: number | null }>('SELECT max(seq) AS seq FROM events').one().seq ?? 0
    );
  }

  outcome(opId: OpId): Outcome | null {
    const applied = this.sql
      .exec<{ seq: number }>('SELECT seq FROM events WHERE op_id = ?', opId)
      .toArray()[0];
    if (applied !== undefined) return { seq: applied.seq };
    const rejected = this.sql
      .exec<{ reason: RejectReason }>('SELECT reason FROM rejections WHERE op_id = ?', opId)
      .toArray()[0];
    return rejected === undefined ? null : { reason: rejected.reason };
  }

  reject(opId: OpId, reason: RejectReason, at: number): void {
    this.sql.exec(
      'INSERT OR IGNORE INTO rejections (op_id, reason, at) VALUES (?, ?, ?)',
      opId,
      reason,
      at,
    );
  }

  insert(event: FarmEvent): void {
    this.sql.exec(
      'INSERT INTO events (seq, op_id, at, actor, kind, payload, rules_version) VALUES (?, ?, ?, ?, ?, ?, ?)',
      event.seq,
      event.opId,
      event.at,
      event.actor,
      event.kind,
      JSON.stringify(event.payload),
      event.rulesVersion,
    );
  }

  event(seq: number): EventEnvelope | null {
    const row = this.sql.exec<EventRow>('SELECT * FROM events WHERE seq = ?', seq).toArray()[0];
    return row === undefined ? null : envelopeOf(row);
  }

  /** Events from `actor`, oldest first. */
  byActor(actor: string): EventEnvelope[] {
    return this.sql
      .exec<EventRow>('SELECT * FROM events WHERE actor = ? ORDER BY seq', actor)
      .toArray()
      .map(envelopeOf);
  }

  /** Events of one kind whose payload points at `target`. */
  pointingAt(kind: EventKind, target: number): EventEnvelope[] {
    return this.sql
      .exec<EventRow>(
        "SELECT * FROM events WHERE kind = ? AND json_extract(payload, '$.target') = ? ORDER BY seq",
        kind,
        target,
      )
      .toArray()
      .map(envelopeOf);
  }

  /** When `actor` last wrote an event of this kind. */
  lastAt(kind: EventKind, actor: string): number | null {
    return this.sql
      .exec<{ at: number | null }>(
        'SELECT max(at) AS at FROM events WHERE kind = ? AND actor = ?',
        kind,
        actor,
      )
      .one().at;
  }

  /** Everyone who wrote an event of this kind since `at`. */
  actorsSince(kind: EventKind, at: number): string[] {
    return this.sql
      .exec<{ actor: string }>(
        'SELECT DISTINCT actor FROM events WHERE kind = ? AND at >= ? AND actor IS NOT NULL',
        kind,
        at,
      )
      .toArray()
      .map((row) => row.actor);
  }

  /** The newest event of a kind. */
  latest(kind: EventKind): EventEnvelope | null {
    const row = this.sql
      .exec<EventRow>('SELECT * FROM events WHERE kind = ? ORDER BY seq DESC LIMIT 1', kind)
      .toArray()[0];
    return row === undefined ? null : envelopeOf(row);
  }

  /** Events of a kind since `at`, oldest first. */
  kindSince(kind: EventKind, at: number): EventEnvelope[] {
    return this.sql
      .exec<EventRow>('SELECT * FROM events WHERE kind = ? AND at >= ? ORDER BY seq', kind, at)
      .toArray()
      .map(envelopeOf);
  }

  replacePayload(seq: number, payload: unknown): void {
    this.sql.exec('UPDATE events SET payload = ? WHERE seq = ?', JSON.stringify(payload), seq);
  }

  /** Up to `limit` events after `after` (and before `before`), oldest first. */
  after(
    after: number,
    limit: number,
    kinds?: readonly EventKind[],
    before?: number,
  ): EventEnvelope[] {
    const f = kindFilter(kinds);
    return this.sql
      .exec<EventRow>(
        `SELECT * FROM events WHERE seq > ? AND seq < ?${f.sql} ORDER BY seq LIMIT ?`,
        after,
        before ?? Number.MAX_SAFE_INTEGER,
        ...f.args,
        limit,
      )
      .toArray()
      .map(envelopeOf);
  }

  /** Up to `limit` events before `before` (or the newest), oldest first. */
  before(before: number | null, limit: number, kinds?: readonly EventKind[]): EventEnvelope[] {
    const f = kindFilter(kinds);
    return this.sql
      .exec<EventRow>(
        `SELECT * FROM events WHERE seq < ?${f.sql} ORDER BY seq DESC LIMIT ?`,
        before ?? Number.MAX_SAFE_INTEGER,
        ...f.args,
        limit,
      )
      .toArray()
      .map(envelopeOf)
      .reverse();
  }

  loadSnapshot(): { seq: number; state: FarmState } | null {
    const row = this.sql
      .exec<{ seq: number; state: string }>('SELECT seq, state FROM snapshot WHERE id = 1')
      .toArray()[0];
    return row === undefined ? null : { seq: row.seq, state: JSON.parse(row.state) as FarmState };
  }

  saveSnapshot(seq: number, state: FarmState): void {
    this.sql.exec(
      'INSERT INTO snapshot (id, seq, state) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET seq = excluded.seq, state = excluded.state',
      seq,
      JSON.stringify(state),
    );
  }

  /** Sets a timer, moving it if one with that key is waiting. */
  setTimer(key: string, due: number): void {
    this.sql.exec('INSERT OR REPLACE INTO timers (key, due) VALUES (?, ?)', key, due);
  }

  /** Adds a timer unless one with that key is already waiting. */
  addTimer(key: string, due: number): void {
    this.sql.exec('INSERT OR IGNORE INTO timers (key, due) VALUES (?, ?)', key, due);
  }

  deleteTimer(key: string): void {
    this.sql.exec('DELETE FROM timers WHERE key = ?', key);
  }

  deleteTimers(prefix: string): void {
    this.sql.exec('DELETE FROM timers WHERE key LIKE ?', `${prefix}%`);
  }

  dueTimers(now: number): Timer[] {
    return this.sql
      .exec<Timer>('SELECT key, due FROM timers WHERE due <= ? ORDER BY due', now)
      .toArray();
  }

  nextDue(): number | null {
    return this.sql.exec<{ due: number | null }>('SELECT min(due) AS due FROM timers').one().due;
  }

  index(seq: number, body: string): void {
    this.sql.exec('DELETE FROM search WHERE rowid = ?', seq);
    this.sql.exec('INSERT INTO search (rowid, body) VALUES (?, ?)', seq, body);
  }

  unindex(seq: number): void {
    this.sql.exec('DELETE FROM search WHERE rowid = ?', seq);
  }

  search(match: string, limit: number): SearchHit[] {
    return this.sql
      .exec<SearchHit>(
        `SELECT e.seq AS seq, e.at AS at, e.actor AS actor, e.kind AS kind,
           snippet(search, 0, '', '', '…', 24) AS snippet
         FROM search JOIN events e ON e.seq = search.rowid
         WHERE search MATCH ? ORDER BY e.seq DESC LIMIT ?`,
        match,
        limit,
      )
      .toArray();
  }

  hold(seq: number, payload: unknown): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO held (seq, payload) VALUES (?, ?)',
      seq,
      JSON.stringify(payload),
    );
  }

  /** A held payload, removed from the hold. */
  release(seq: number): unknown {
    const sql = 'DELETE FROM held WHERE seq = ? RETURNING payload';
    const row = this.sql.exec<{ payload: string }>(sql, seq).toArray()[0];
    return row === undefined ? undefined : (JSON.parse(row.payload) as unknown);
  }
}
