import type { OpId, RejectReason } from '@kithfield/contracts';

import { type Outcome, SCHEMA, type Timer, type TradeHalf } from './store-rows';

/*
 * The farm object's side tables, beside the log: rejected op ids, timers, payloads held for an
 * appeal, merged-away ids, the resync point, cottage deliveries still owed, and trade halves.
 */

/** Rejections are kept 30 days: an outbox retries within minutes, never a month later. */
export const REJECTIONS_KEPT_MS = 30 * 86_400_000;
/** A removed payload is held 180 days, the appeal window, then dropped for good. */
export const HELD_KEPT_MS = 180 * 86_400_000;

export class FarmTables {
  constructor(protected readonly sql: SqlStorage) {
    for (const statement of SCHEMA) sql.exec(statement);
  }

  protected rejection(opId: OpId): Outcome | null {
    const rejected = this.sql
      .exec<{ reason: RejectReason }>('SELECT reason FROM rejections WHERE op_id = ?', opId)
      .toArray()[0];
    return rejected === undefined ? null : { reason: rejected.reason };
  }

  reject(opId: OpId, reason: RejectReason, at: number): void {
    const sql = 'INSERT OR IGNORE INTO rejections (op_id, reason, at) VALUES (?, ?, ?)';
    this.sql.exec(sql, opId, reason, at);
  }

  /** Drops old rejections and held payloads past the appeal window. */
  prune(now: number): void {
    this.sql.exec('DELETE FROM rejections WHERE at < ?', now - REJECTIONS_KEPT_MS);
    this.sql.exec('DELETE FROM held WHERE at < ?', now - HELD_KEPT_MS);
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
    const sql = 'SELECT key, due FROM timers WHERE due <= ? ORDER BY due';
    return this.sql.exec<Timer>(sql, now).toArray();
  }

  nextDue(): number | null {
    return this.sql.exec<{ due: number | null }>('SELECT min(due) AS due FROM timers').one().due;
  }

  hold(seq: number, payload: unknown, at: number): void {
    const sql = 'INSERT OR REPLACE INTO held (seq, payload, at) VALUES (?, ?, ?)';
    this.sql.exec(sql, seq, JSON.stringify(payload), at);
  }

  /** A held payload, removed from the hold. */
  release(seq: number): unknown {
    const sql = 'DELETE FROM held WHERE seq = ? RETURNING payload';
    const row = this.sql.exec<{ payload: string }>(sql, seq).toArray()[0];
    return row === undefined ? undefined : (JSON.parse(row.payload) as unknown);
  }

  /** A merged-away person's id and who they became. */
  aliases(): Map<string, string> {
    const rows = this.sql.exec<{ from_person: string; into_person: string }>(
      'SELECT * FROM aliases',
    );
    return new Map(rows.toArray().map((r) => [r.from_person, r.into_person]));
  }

  addAlias(from: string, into: string): void {
    const sql = 'INSERT OR REPLACE INTO aliases (from_person, into_person) VALUES (?, ?)';
    this.sql.exec(sql, from, into);
    this.sql.exec('UPDATE aliases SET into_person = ? WHERE into_person = ?', into, from);
  }

  /** A person's id and every id merged into it: their events, whichever id wrote them. */
  idsOf(person: string): string[] {
    const sql = 'SELECT from_person FROM aliases WHERE into_person = ?';
    const merged = this.sql.exec<{ from_person: string }>(sql, person).toArray();
    return [person, ...merged.map((r) => r.from_person)];
  }

  /** Phones holding less than this take a snapshot on hello. */
  resyncBelow(): number {
    const row = this.sql
      .exec<{ below: number }>('SELECT below FROM resync WHERE id = 1')
      .toArray()[0];
    return row?.below ?? 0;
  }

  setResyncBelow(below: number): void {
    const sql =
      'INSERT INTO resync (id, below) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET below = excluded.below';
    this.sql.exec(sql, below);
  }

  oweDelivery(seq: number): void {
    this.sql.exec('INSERT OR IGNORE INTO deliveries (seq) VALUES (?)', seq);
  }

  owedDeliveries(): number[] {
    const rows = this.sql.exec<{ seq: number }>('SELECT seq FROM deliveries ORDER BY seq');
    return rows.toArray().map((r) => r.seq);
  }

  delivered(seq: number): void {
    this.sql.exec('DELETE FROM deliveries WHERE seq = ?', seq);
  }

  owesTradeHalf(half: TradeHalf): void {
    this.sql.exec(
      'INSERT OR IGNORE INTO trade_halves (op_id, other_farm, actor, payload) VALUES (?, ?, ?, ?)',
      half.opId,
      half.otherFarm,
      half.actor,
      JSON.stringify(half.payload),
    );
  }

  tradeHalves(): TradeHalf[] {
    const rows = this.sql.exec<{
      op_id: string;
      other_farm: string;
      actor: string;
      payload: string;
    }>('SELECT * FROM trade_halves');
    return rows.toArray().map((r) => ({
      opId: r.op_id,
      otherFarm: r.other_farm,
      actor: r.actor,
      payload: JSON.parse(r.payload) as unknown,
    }));
  }

  tradeHalfDone(opId: string): void {
    this.sql.exec('DELETE FROM trade_halves WHERE op_id = ?', opId);
  }
}
