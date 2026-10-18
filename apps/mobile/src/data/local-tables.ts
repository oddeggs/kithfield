import { ChatListItem, type OpId, type FarmId, type RejectReason } from '@kithfield/contracts';

import type { SqlValue } from '../db/sql';

export type Row = Record<string, SqlValue>;

export const json = (value: unknown): string => JSON.stringify(value) ?? 'null';
export const parse = (value: SqlValue | undefined): unknown => JSON.parse(String(value ?? 'null'));

export interface StoredRejection {
  readonly opId: OpId;
  readonly farm: FarmId;
  readonly kind: string;
  readonly payload: unknown;
  readonly reason: RejectReason;
  readonly at: number;
}

type Run = (source: string, params: SqlValue[]) => Promise<unknown>;
type All = (source: string, params: SqlValue[]) => Promise<Row[]>;

/** The phone's own small tables: refused writes, the cottage's chat list and flags. */
export function localTables(run: Run, all: All) {
  return {
    /* Rejections */

    addRejection(r: StoredRejection) {
      return run(
        'INSERT OR REPLACE INTO rejections (op_id, farm, kind, payload, reason, at) VALUES (?, ?, ?, ?, ?, ?)',
        [r.opId, r.farm, r.kind, json(r.payload), r.reason, r.at],
      );
    },

    async rejections(): Promise<StoredRejection[]> {
      const rows = await all('SELECT * FROM rejections ORDER BY at', []);
      return rows.map((r) => ({
        opId: String(r['op_id']),
        farm: String(r['farm']),
        kind: String(r['kind']),
        payload: parse(r['payload']),
        reason: String(r['reason']) as RejectReason,
        at: Number(r['at']),
      }));
    },

    dismissRejection(opId: string) {
      return run('DELETE FROM rejections WHERE op_id = ?', [opId]);
    },

    /* The cottage's chat list */

    async replaceChats(rows: readonly ChatListItem[]) {
      await run('DELETE FROM chats', []);
      for (const row of rows)
        await run('INSERT INTO chats (farm, row, at) VALUES (?, ?, ?)', [
          row.farm,
          json(row),
          row.at,
        ]);
    },

    putChat(row: ChatListItem) {
      return run('INSERT OR REPLACE INTO chats (farm, row, at) VALUES (?, ?, ?)', [
        row.farm,
        json(row),
        row.at,
      ]);
    },

    /** Newest first. Rows this app version can no longer read are skipped. */
    async chats(): Promise<ChatListItem[]> {
      const rows = await all('SELECT row FROM chats ORDER BY at DESC', []);
      return rows.flatMap((r) => {
        const parsed = ChatListItem.safeParse(parse(r['row']));
        return parsed.success ? [parsed.data] : [];
      });
    },

    /* Flags */

    async meta(key: string): Promise<string | null> {
      const [row] = await all('SELECT value FROM meta WHERE key = ?', [key]);
      return row ? String(row['value']) : null;
    },

    setMeta(key: string, value: string | null) {
      return value === null
        ? run('DELETE FROM meta WHERE key = ?', [key])
        : run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
    },
  };
}
