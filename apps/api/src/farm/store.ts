import type { EventEnvelope, EventKind, FarmEvent, FarmState, OpId } from '@kithfield/contracts';

import {
  actorIn,
  envelopeOf,
  type EventRow,
  kindFilter,
  type Outcome,
  type SearchHit,
} from './store-rows';
import { FarmTables } from './store-side';

/*
 * The farm object's SQLite storage: the ordered log, the reducer's snapshot and the search index,
 * over the side tables in `FarmTables`. Queries by person take every id merged into them.
 */

const DAY_MS = 86_400_000;

export class FarmStore extends FarmTables {
  head(): number {
    return (
      this.sql.exec<{ seq: number | null }>('SELECT max(seq) AS seq FROM events').one().seq ?? 0
    );
  }

  outcome(opId: OpId): Outcome | null {
    const applied = this.sql
      .exec<{ seq: number }>('SELECT seq FROM events WHERE op_id = ?', opId)
      .toArray()[0];
    return applied !== undefined ? { seq: applied.seq } : this.rejection(opId);
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

  private rows(sql: string, ...args: (string | number)[]): EventEnvelope[] {
    return this.sql
      .exec<EventRow>(sql, ...args)
      .toArray()
      .map(envelopeOf);
  }

  event(seq: number): EventEnvelope | null {
    return this.rows('SELECT * FROM events WHERE seq = ?', seq)[0] ?? null;
  }

  /** Events from a person under any of their ids, oldest first. */
  byActor(person: string): EventEnvelope[] {
    const ids = this.idsOf(person);
    return this.rows(`SELECT * FROM events WHERE ${actorIn(ids)} ORDER BY seq`, ...ids);
  }

  /** Friends a person knocked for on a farm day; a recalled knock still counts. */
  knockedOn(person: string, day: string): string[] {
    const ids = this.idsOf(person);
    return this.sql
      .exec<{ to: string }>(
        `SELECT DISTINCT coalesce(json_extract(payload, '$.to'), json_extract(payload, '$.facts.to')) AS "to"
         FROM events WHERE kind = 'knock' AND ${actorIn(ids)} AND day = ?`,
        ...ids,
        day,
      )
      .toArray()
      .map((row) => row.to)
      .filter((to) => typeof to === 'string');
  }

  /** Whether a person has sat by the fire since `since`. */
  satSince(person: string, since: number): boolean {
    const ids = this.idsOf(person);
    const sql = `SELECT 1 FROM events WHERE kind = 'fire' AND ${actorIn(ids)} AND at >= ?
      AND coalesce(json_extract(payload, '$.state'), json_extract(payload, '$.facts.state')) = 'sat' LIMIT 1`;
    return this.sql.exec(sql, ...ids, since).toArray().length > 0;
  }

  /** Whether a visitor has already left something at the gate on a farm day. */
  gatedOn(person: string, day: string): boolean {
    const ids = this.idsOf(person);
    const sql = `SELECT 1 FROM events WHERE kind = 'gate' AND ${actorIn(ids)} AND day = ? LIMIT 1`;
    return this.sql.exec(sql, ...ids, day).toArray().length > 0;
  }

  /** Whether this farm traded with another farm in the last `days` days. */
  tradedWith(otherFarm: string, now: number, days: number): boolean {
    const sql = `SELECT 1 FROM events WHERE kind = 'traded' AND at >= ?
      AND json_extract(payload, '$.otherFarm') = ? LIMIT 1`;
    return this.sql.exec(sql, now - days * DAY_MS, otherFarm).toArray().length > 0;
  }

  /** Trades on this farm made with a visitor (they are `with`, the local member the actor). */
  tradesWith(person: string): EventEnvelope[] {
    const ids = this.idsOf(person);
    const placeholders = ids.map(() => '?').join(',');
    return this.rows(
      `SELECT * FROM events WHERE kind = 'traded' AND json_extract(payload, '$.with') IN (${placeholders}) ORDER BY seq`,
      ...ids,
    );
  }

  /** Events of one kind whose payload points at `target`. */
  pointingAt(kind: EventKind, target: number): EventEnvelope[] {
    return this.withField(kind, 'target', target);
  }

  /** Events of one kind whose payload has `field` equal to `value`, oldest first. */
  withField(kind: EventKind, field: string, value: number | string): EventEnvelope[] {
    const sql = 'SELECT * FROM events WHERE kind = ? AND json_extract(payload, ?) = ? ORDER BY seq';
    return this.rows(sql, kind, `$.${field}`, value);
  }

  /** When a person last wrote an event of this kind, under any of their ids. */
  lastAt(kind: EventKind, person: string): number | null {
    const ids = this.idsOf(person);
    const sql = `SELECT max(at) AS at FROM events WHERE kind = ? AND ${actorIn(ids)}`;
    return this.sql.exec<{ at: number | null }>(sql, kind, ...ids).one().at;
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
    return this.rows(
      `SELECT * FROM events WHERE seq > ? AND seq < ?${f.sql} ORDER BY seq LIMIT ?`,
      after,
      before ?? Number.MAX_SAFE_INTEGER,
      ...f.args,
      limit,
    );
  }

  /** Up to `limit` events before `before` (or the newest), oldest first. */
  before(before: number | null, limit: number, kinds?: readonly EventKind[]): EventEnvelope[] {
    const f = kindFilter(kinds);
    return this.rows(
      `SELECT * FROM events WHERE seq < ?${f.sql} ORDER BY seq DESC LIMIT ?`,
      before ?? Number.MAX_SAFE_INTEGER,
      ...f.args,
      limit,
    ).reverse();
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
}
