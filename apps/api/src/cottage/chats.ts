import {
  type ChatListItem,
  type CottageDelivery,
  type CottageFarm,
  FarmKind,
  VisitPeer,
} from '@kithfield/contracts';

/** At most this many things wait in Quick Tend per farm (`ChatListItem.waiting`). */
const WAITING_CAP = 99;
/** The chat list frame carries at most this many rows. */
const CHATS_CAP = 500;

/** One thing waiting in Quick Tend. */
export interface WaitingItem {
  readonly farm: string;
  readonly seq: number;
  readonly kind: string;
  readonly actor: string | null;
  readonly at: number;
}

type FarmRow = {
  farm: string;
  farm_kind: string | null;
  name: string | null;
  with_json: string | null;
  pinned: number;
  muted_until: number | null;
  seq: number | null;
  kind: string | null;
  actor: string | null;
  at: number | null;
  preview: string | null;
  for_you: number | null;
};

/**
 * What the chat list needs about a farm that its events don't say: its kind, and its name or,
 * for a visit, the other person. The person's own pin and mute stay as they were.
 */
export function upsertFarm(sql: SqlStorage, info: CottageFarm): void {
  sql.exec(
    `INSERT INTO farms (farm, farm_kind, name, with_json) VALUES (?, ?, ?, ?)
     ON CONFLICT (farm) DO UPDATE SET farm_kind = excluded.farm_kind, name = excluded.name,
       with_json = excluded.with_json`,
    info.farm,
    info.farmKind,
    info.name,
    info.with === null ? null : JSON.stringify(info.with),
  );
}

/** The person left the farm: its row, what waited there and any push held for it go. */
export function removeFarm(sql: SqlStorage, farm: string): void {
  sql.exec('DELETE FROM farms WHERE farm = ?', farm);
  sql.exec('DELETE FROM doorstep WHERE farm = ?', farm);
  sql.exec("DELETE FROM held WHERE json_extract(job, '$.farm') = ?", farm);
}

/** Whether the cottage knows this farm: its kind and name, so it can show on the chat list. */
export function knowsFarm(sql: SqlStorage, farm: string): boolean {
  return (
    sql.exec('SELECT 1 FROM farms WHERE farm = ? AND farm_kind IS NOT NULL', farm).toArray()
      .length > 0
  );
}

/** Mutes a farm until a time, or unmutes it with null. Nobody can see that you muted. */
export function setMuted(sql: SqlStorage, farm: string, until: number | null): void {
  sql.exec('UPDATE farms SET muted_until = ? WHERE farm = ?', until, farm);
}

export function setPinned(sql: SqlStorage, farm: string, pinned: boolean): void {
  sql.exec('UPDATE farms SET pinned = ? WHERE farm = ?', Number(pinned), farm);
}

export function isMuted(sql: SqlStorage, farm: string | null, now: number): boolean {
  if (farm === null) return false;
  const row = sql
    .exec<{ until: number | null }>('SELECT muted_until AS until FROM farms WHERE farm = ?', farm)
    .toArray()[0];
  return row?.until != null && row.until > now;
}

/** Delivered seqs are remembered this long to tell repeats from late arrivals. */
const DELIVERED_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Takes a newly committed event into the chat list. A seq delivered before is a repeat and changes
 * nothing (returns false). A late arrival (a slow post, or events committed together arriving out
 * of order) still counts, but the chat row keeps showing the newest event. Something meant for the
 * person waits in Quick Tend unless they have the farm open; opening the farm clears what waited
 * there before it.
 */
export function applyDelivery(
  sql: SqlStorage,
  delivery: CottageDelivery,
  person: string,
  now: number,
): boolean {
  sql.exec('DELETE FROM delivered WHERE at < ?', now - DELIVERED_KEEP_MS);
  const fresh = sql.exec(
    'INSERT OR IGNORE INTO delivered (farm, seq, at) VALUES (?, ?, ?)',
    delivery.farm,
    delivery.seq,
    now,
  ).rowsWritten;
  if (fresh === 0) return false;
  sql.exec(
    `INSERT INTO farms (farm, seq, kind, actor, at, preview, for_you) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (farm) DO UPDATE SET seq = excluded.seq, kind = excluded.kind,
       actor = excluded.actor, at = excluded.at, preview = excluded.preview,
       for_you = excluded.for_you
     WHERE excluded.seq > coalesce(farms.seq, -1)`,
    delivery.farm,
    delivery.seq,
    delivery.kind,
    delivery.actor,
    delivery.at,
    delivery.preview,
    Number(delivery.forYou),
  );
  if (delivery.actor === person && delivery.kind === 'farm_opened') {
    sql.exec('DELETE FROM doorstep WHERE farm = ? AND seq < ?', delivery.farm, delivery.seq);
  } else if (delivery.forYou && delivery.actor !== person && !delivery.connected) {
    sql.exec(
      'INSERT OR IGNORE INTO doorstep (farm, seq, kind, actor, at) VALUES (?, ?, ?, ?, ?)',
      delivery.farm,
      delivery.seq,
      delivery.kind,
      delivery.actor,
      delivery.at,
    );
  }
  return true;
}

/** Forgets a delivery, so the same seq delivered again is taken. */
export function forgetDelivered(sql: SqlStorage, farm: string, seq: number): void {
  sql.exec('DELETE FROM delivered WHERE farm = ? AND seq = ?', farm, seq);
}

export function clearWaiting(sql: SqlStorage, farm: string): void {
  sql.exec('DELETE FROM doorstep WHERE farm = ?', farm);
}

/** Everything waiting in Quick Tend, newest first. */
export function waitingItems(sql: SqlStorage): WaitingItem[] {
  return sql
    .exec<{ farm: string; seq: number; kind: string; actor: string | null; at: number }>(
      'SELECT farm, seq, kind, actor, at FROM doorstep ORDER BY at DESC LIMIT 500',
    )
    .toArray();
}

/** The chat list row for a farm, once the cottage knows both the farm and an event on it. */
export function chatRow(sql: SqlStorage, farm: string, now: number): ChatListItem | null {
  const row = sql.exec<FarmRow>('SELECT * FROM farms WHERE farm = ?', farm).toArray()[0];
  return row === undefined ? null : toItem(sql, row, now);
}

/** The whole chat list: pinned first, then the latest activity first. */
export function chatList(sql: SqlStorage, now: number): ChatListItem[] {
  const rows = sql
    .exec<FarmRow>(
      `SELECT * FROM farms WHERE farm_kind IS NOT NULL AND seq IS NOT NULL
       ORDER BY pinned DESC, at DESC LIMIT ${CHATS_CAP}`,
    )
    .toArray();
  return rows.flatMap((row) => toItem(sql, row, now) ?? []);
}

/** How the farm reads on the lock screen: its name, or the other person's on a visit. */
export function farmTitle(sql: SqlStorage, farm: string | null): string | null {
  if (farm === null) return null;
  const row = sql
    .exec<Pick<FarmRow, 'name' | 'with_json'>>(
      'SELECT name, with_json FROM farms WHERE farm = ?',
      farm,
    )
    .toArray()[0];
  if (row === undefined) return null;
  return row.name ?? peerOf(row.with_json)?.name ?? null;
}

/** The visit's other person, when the actor is them: their name needs no lookup. */
export function peerName(sql: SqlStorage, farm: string, actor: string): string | null {
  const row = sql
    .exec<Pick<FarmRow, 'with_json'>>('SELECT with_json FROM farms WHERE farm = ?', farm)
    .toArray()[0];
  const peer = peerOf(row?.with_json ?? null);
  return peer?.person === actor ? peer.name : null;
}

function peerOf(json: string | null): VisitPeer | null {
  return json === null ? null : VisitPeer.parse(JSON.parse(json));
}

function toItem(sql: SqlStorage, row: FarmRow, now: number): ChatListItem | null {
  if (row.farm_kind === null || row.seq === null || row.kind === null || row.at === null) {
    return null;
  }
  const waiting = sql
    .exec<{ n: number }>('SELECT count(*) AS n FROM doorstep WHERE farm = ?', row.farm)
    .one().n;
  return {
    farm: row.farm,
    seq: row.seq,
    kind: row.kind,
    actor: row.actor,
    at: row.at,
    preview: row.preview,
    forYou: row.for_you === 1,
    farmKind: FarmKind.parse(row.farm_kind),
    name: row.name,
    with: peerOf(row.with_json),
    waiting: Math.min(waiting, WAITING_CAP),
    muted: row.muted_until !== null && row.muted_until > now,
    pinned: row.pinned === 1,
  };
}
