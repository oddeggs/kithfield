import { FarmState, type FarmId, type OpId } from '@kithfield/contracts';

import { createSerialQueue, type SqlDatabase, type SqlValue } from '../db/sql';
import { json, localTables, parse, type Row } from './local-tables';

export type { StoredRejection } from './local-tables';

/** What the phone holds for one farm: the state the reducer left at `lastSeq`. */
export interface FarmRecord {
  readonly farm: FarmId;
  readonly lastSeq: number;
  readonly state: FarmState | null;
  /** An invalid event was skipped; the farm's snapshot is wanted. */
  readonly needsSnapshot: boolean;
}

/** One cached log entry. `known` is false for a kind this app doesn't know. */
export interface StoredEvent {
  readonly seq: number;
  readonly opId: string;
  readonly at: number;
  readonly actor: string | null;
  readonly kind: string;
  readonly payload: unknown;
  readonly rulesVersion: number;
  readonly known: boolean;
}

export interface OutboxEntry {
  readonly opId: OpId;
  readonly farm: FarmId;
  readonly actor: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly createdAt: number;
  readonly attempts: number;
  /** Set once the farm acknowledged it; the row goes once the phone holds that seq. */
  readonly ackedSeq: number | null;
}

export interface InvalidEvent {
  readonly seq: number | null;
  readonly kind: string | null;
  readonly raw: unknown;
  readonly issues: readonly (readonly (string | number)[])[];
}

const eventOf = (r: Row): StoredEvent => ({
  seq: Number(r['seq']),
  opId: String(r['op_id']),
  at: Number(r['at']),
  actor: r['actor'] === null ? null : String(r['actor']),
  kind: String(r['kind']),
  payload: parse(r['payload']),
  rulesVersion: Number(r['rules_version']),
  known: r['known'] === 1,
});

const outboxOf = (r: Row): OutboxEntry => ({
  opId: String(r['op_id']),
  farm: String(r['farm']),
  actor: String(r['actor']),
  kind: String(r['kind']),
  payload: parse(r['payload']),
  createdAt: Number(r['created_at']),
  attempts: Number(r['attempts']),
  ackedSeq: r['acked_seq'] === null ? null : Number(r['acked_seq']),
});

const EVENT_COLUMNS = 'seq, op_id, at, actor, kind, payload, rules_version, known';

/**
 * The phone's sync tables. Reads go straight to SQLite; every write runs inside `transaction`,
 * one at a time, so a batch of events, the farm's new state and the outbox change commit together.
 */
export function createSyncStore(db: SqlDatabase) {
  const serial = createSerialQueue();
  const all = (source: string, params: SqlValue[]) => db.getAllAsync<Row>(source, params);
  const run = (source: string, params: SqlValue[]) => db.runAsync(source, params);

  return {
    transaction<T>(task: () => Promise<T>): Promise<T> {
      return serial(async () => {
        let result: T | undefined;
        await db.withTransactionAsync(async () => {
          result = await task();
        });
        return result as T;
      });
    },

    /* Farms */

    async farm(farm: FarmId): Promise<FarmRecord> {
      const [row] = await all('SELECT last_seq, state, needs_snapshot FROM farms WHERE farm = ?', [
        farm,
      ]);
      if (!row) return { farm, lastSeq: 0, state: null, needsSnapshot: false };
      const state = row['state'] === null ? null : FarmState.safeParse(parse(row['state']));
      // A state this app version can no longer read is dropped: the snapshot brings it back.
      if (state && !state.success) return { farm, lastSeq: 0, state: null, needsSnapshot: false };
      return {
        farm,
        lastSeq: Number(row['last_seq']),
        state: state?.data ?? null,
        needsSnapshot: row['needs_snapshot'] === 1,
      };
    },

    saveFarm(record: FarmRecord, now: number) {
      return run(
        `INSERT INTO farms (farm, last_seq, state, needs_snapshot, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (farm) DO UPDATE SET last_seq = excluded.last_seq, state = excluded.state,
           needs_snapshot = excluded.needs_snapshot, updated_at = excluded.updated_at`,
        [
          record.farm,
          record.lastSeq,
          record.state === null ? null : json(record.state),
          record.needsSnapshot ? 1 : 0,
          now,
        ],
      );
    },

    /* Events */

    putEvent(farm: FarmId, e: StoredEvent) {
      return run(
        `INSERT OR REPLACE INTO events (farm, ${EVENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          farm,
          e.seq,
          e.opId,
          e.at,
          e.actor,
          e.kind,
          json(e.payload),
          e.rulesVersion,
          e.known ? 1 : 0,
        ],
      );
    },

    putInvalid(farm: FarmId, invalid: InvalidEvent, now: number) {
      return run(
        'INSERT INTO invalid_events (farm, seq, kind, raw, issues, received_at) VALUES (?, ?, ?, ?, ?, ?)',
        [farm, invalid.seq, invalid.kind, json(invalid.raw), json(invalid.issues), now],
      );
    },

    setPayload(farm: FarmId, seq: number, payload: unknown) {
      return run('UPDATE events SET payload = ? WHERE farm = ? AND seq = ?', [
        json(payload),
        farm,
        seq,
      ]);
    },

    async event(farm: FarmId, seq: number): Promise<StoredEvent | null> {
      const [row] = await all(`SELECT ${EVENT_COLUMNS} FROM events WHERE farm = ? AND seq = ?`, [
        farm,
        seq,
      ]);
      return row ? eventOf(row) : null;
    },

    async eventsBy(farm: FarmId, actor: string): Promise<StoredEvent[]> {
      const rows = await all(
        `SELECT ${EVENT_COLUMNS} FROM events WHERE farm = ? AND actor = ? ORDER BY seq`,
        [farm, actor],
      );
      return rows.map(eventOf);
    },

    /** Up to `limit` events before `before` (or the newest), oldest first. */
    async events(
      farm: FarmId,
      options: { before?: number; limit: number },
    ): Promise<StoredEvent[]> {
      const rows = await all(
        `SELECT ${EVENT_COLUMNS} FROM events WHERE farm = ? AND seq < ? ORDER BY seq DESC LIMIT ?`,
        [farm, options.before ?? Number.MAX_SAFE_INTEGER, options.limit],
      );
      return rows.map(eventOf).reverse();
    },

    async invalidEvents(farm: FarmId): Promise<InvalidEvent[]> {
      const rows = await all(
        'SELECT seq, kind, raw, issues FROM invalid_events WHERE farm = ? ORDER BY id',
        [farm],
      );
      return rows.map((r) => ({
        seq: r['seq'] === null ? null : Number(r['seq']),
        kind: r['kind'] === null ? null : String(r['kind']),
        raw: parse(r['raw']),
        issues: parse(r['issues'] ?? '[]') as InvalidEvent['issues'],
      }));
    },

    /** Which of these op ids the phone already holds in the farm's log. */
    async seenOps(farm: FarmId, opIds: readonly string[]): Promise<Set<string>> {
      if (opIds.length === 0) return new Set();
      const rows = await all(
        `SELECT op_id FROM events WHERE farm = ? AND op_id IN (${opIds.map(() => '?').join(', ')})`,
        [farm, ...opIds],
      );
      return new Set(rows.map((r) => String(r['op_id'])));
    },

    /* Outbox */

    addOutbox(entry: OutboxEntry) {
      return run(
        'INSERT INTO outbox (op_id, farm, actor, kind, payload, created_at, attempts, acked_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          entry.opId,
          entry.farm,
          entry.actor,
          entry.kind,
          json(entry.payload),
          entry.createdAt,
          entry.attempts,
          entry.ackedSeq,
        ],
      );
    },

    async outbox(farm: FarmId): Promise<OutboxEntry[]> {
      const rows = await all('SELECT * FROM outbox WHERE farm = ? ORDER BY n', [farm]);
      return rows.map(outboxOf);
    },

    async outboxFarms(): Promise<FarmId[]> {
      const rows = await all('SELECT DISTINCT farm FROM outbox WHERE acked_seq IS NULL', []);
      return rows.map((r) => String(r['farm']));
    },

    ackOutbox(opId: string, seq: number) {
      return run('UPDATE outbox SET acked_seq = ? WHERE op_id = ?', [seq, opId]);
    },

    countAttempt(opId: string) {
      return run('UPDATE outbox SET attempts = attempts + 1 WHERE op_id = ?', [opId]);
    },

    removeOutbox(opId: string) {
      return run('DELETE FROM outbox WHERE op_id = ?', [opId]);
    },

    ...localTables(run, all),
  };
}

export type SyncStore = ReturnType<typeof createSyncStore>;
