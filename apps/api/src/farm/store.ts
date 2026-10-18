import type {
  EventEnvelope,
  EventKind,
  FarmEvent,
  FarmState,
  OpId,
  RejectReason,
} from '@kithfield/contracts';

import {
  envelopeOf,
  type EventRow,
  kindFilter,
  type Outcome,
  SCHEMA,
  type SearchHit,
  type Timer,
} from './store-rows';

/*
 * The farm object's SQLite storage: the log, every write's outcome (rejections too), the snapshot,
 * search, timers, merged-away ids, and payloads held back after a safety removal for an appeal.
 */

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
      'INSERT INTO events (seq, op_id, at, day, actor, kind, payload, rules_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      event.seq,
      event.opId,
      event.at,
      event.day ?? null,
      event.actor,
      event.kind,
      JSON.stringify(event.payload),
      event.rulesVersion,
    );
  }

  /** Friends `actor` knocked for on a farm day; a recalled knock still counts. */
  knockedOn(actor: string, day: string): string[] {
    return this.sql
      .exec<{ to: string }>(
        `SELECT DISTINCT coalesce(json_extract(payload, '$.to'), json_extract(payload, '$.facts.to')) AS "to"
         FROM events WHERE kind = 'knock' AND actor = ? AND day = ?`,
        actor,
        day,
      )
      .toArray()
      .map((row) => row.to)
      .filter((to) => typeof to === 'string');
  }

  /** Whether `actor` has sat by the fire since `since`. */
  satSince(actor: string, since: number): boolean {
    return (
      this.sql
        .exec(
          `SELECT 1 FROM events WHERE kind = 'fire' AND actor = ? AND at >= ?
           AND coalesce(json_extract(payload, '$.state'), json_extract(payload, '$.facts.state')) = 'sat' LIMIT 1`,
          actor,
          since,
        )
        .toArray().length > 0
    );
  }

  /** A merged-away person's id and who they became. */
  aliases(): Map<string, string> {
    const rows = this.sql.exec<{ from_person: string; into_person: string }>(
      'SELECT * FROM aliases',
    );
    return new Map(rows.toArray().map((r) => [r.from_person, r.into_person]));
  }

  addAlias(from: string, into: string): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO aliases (from_person, into_person) VALUES (?, ?)',
      from,
      into,
    );
    this.sql.exec('UPDATE aliases SET into_person = ? WHERE into_person = ?', into, from);
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
    return this.withField(kind, 'target', target);
  }

  /** Events of one kind whose payload has `field` equal to `value`, oldest first. */
  withField(kind: EventKind, field: string, value: number | string): EventEnvelope[] {
    return this.sql
      .exec<EventRow>(
        'SELECT * FROM events WHERE kind = ? AND json_extract(payload, ?) = ? ORDER BY seq',
        kind,
        `$.${field}`,
        value,
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
