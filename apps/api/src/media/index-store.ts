import type { FarmId, PersonId } from '@kithfield/contracts';

import type { MediaKind } from './rules';

/* The media index in D1 (`media_objects`): who uploaded which key where, and quarantines. */

export type MediaRow = {
  key: string;
  farm_id: FarmId;
  person_id: PersonId | null;
  kind: MediaKind;
  mime: string;
  bytes: number;
  upload_id: string | null;
  created_at: number;
  completed_at: number | null;
  quarantined_at: number | null;
  report_id: string | null;
  referenced_at: number | null;
};

const COLUMNS =
  'key, farm_id, person_id, kind, mime, bytes, upload_id, created_at, completed_at, quarantined_at, report_id, referenced_at';

/** Records a key as an upload URL is handed out for it. */
export const recordUpload = (
  db: D1Database,
  row: {
    key: string;
    farm: FarmId;
    person: PersonId;
    kind: MediaKind;
    mime: string;
    bytes: number;
    uploadId: string | null;
    at: number;
  },
) =>
  db
    .prepare(
      'INSERT INTO media_objects (key, farm_id, person_id, kind, mime, bytes, upload_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(row.key, row.farm, row.person, row.kind, row.mime, row.bytes, row.uploadId, row.at)
    .run();

export const mediaRow = (db: D1Database, key: string): Promise<MediaRow | null> =>
  db.prepare(`SELECT ${COLUMNS} FROM media_objects WHERE key = ?`).bind(key).first<MediaRow>();

/** The rows for these keys, by key. */
export async function mediaRows(
  db: D1Database,
  keys: readonly string[],
): Promise<Map<string, MediaRow>> {
  if (keys.length === 0) return new Map();
  const marks = keys.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM media_objects WHERE key IN (${marks})`)
    .bind(...keys)
    .all<MediaRow>();
  return new Map(results.map((row) => [row.key, row]));
}

export const markCompleted = (db: D1Database, key: string, at: number) =>
  db
    .prepare('UPDATE media_objects SET completed_at = ?, upload_id = NULL WHERE key = ?')
    .bind(at, key)
    .run();

/** Whether reads of this key must be refused. */
export async function isQuarantined(db: D1Database, key: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT quarantined_at FROM media_objects WHERE key = ?')
    .bind(key)
    .first<{ quarantined_at: number | null }>();
  return row?.quarantined_at != null;
}

/**
 * Marks a key quarantined, adding its row when the index never had it. Keeps the first
 * quarantine's time and who did it; answers whether this call was the first.
 */
export async function markQuarantined(
  db: D1Database,
  input: { key: string; farm: FarmId; by: string; note: string | null; at: number },
): Promise<boolean> {
  await db
    .prepare(
      `INSERT INTO media_objects (key, farm_id, person_id, kind, mime, bytes, created_at)
       VALUES (?, ?, NULL, 'file', 'application/octet-stream', 1, ?)
       ON CONFLICT (key) DO NOTHING`,
    )
    .bind(input.key, input.farm, input.at)
    .run();
  const result = await db
    .prepare(
      `UPDATE media_objects SET quarantined_at = ?, quarantined_by = ?, quarantine_note = ?
       WHERE key = ? AND quarantined_at IS NULL`,
    )
    .bind(input.at, input.by, input.note, input.key)
    .run();
  return result.meta.changes > 0;
}

export const setReport = (db: D1Database, key: string, report: string) =>
  db.prepare('UPDATE media_objects SET report_id = ? WHERE key = ?').bind(report, key).run();

/** A person's uploads that may be deleted: everything but quarantined evidence. */
export async function deletableOf(
  db: D1Database,
  person: PersonId,
): Promise<{ key: string; upload_id: string | null }[]> {
  const { results } = await db
    .prepare(
      'SELECT key, upload_id FROM media_objects WHERE person_id = ? AND quarantined_at IS NULL',
    )
    .bind(person)
    .all<{ key: string; upload_id: string | null }>();
  return results;
}

/** A farm's uploads that may be deleted: everything but quarantined evidence. */
export async function deletableOnFarm(
  db: D1Database,
  farm: FarmId,
): Promise<{ key: string; upload_id: string | null }[]> {
  const { results } = await db
    .prepare(
      'SELECT key, upload_id FROM media_objects WHERE farm_id = ? AND quarantined_at IS NULL',
    )
    .bind(farm)
    .all<{ key: string; upload_id: string | null }>();
  return results;
}

/** Drops the rows of deleted keys. Quarantined rows stay: they are the record of the evidence. */
export async function dropRows(db: D1Database, keys: readonly string[]): Promise<void> {
  // D1 binds at most 100 parameters per statement.
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    await db
      .prepare(
        `DELETE FROM media_objects WHERE quarantined_at IS NULL AND key IN (${chunk.map(() => '?').join(', ')})`,
      )
      .bind(...chunk)
      .run();
  }
}

/** Forgets one key's row (an upload cancelled or swept before it was ever sent). */
export const dropRow = (db: D1Database, key: string) =>
  db.prepare('DELETE FROM media_objects WHERE key = ? AND quarantined_at IS NULL').bind(key).run();

/**
 * Whether the key's bytes are all in R2 and it may be read: finished multipart uploads, and
 * single PUTs once R2 holds the declared size (marked finished the first time that is seen).
 */
export async function isFinished(
  db: D1Database,
  bucket: R2Bucket,
  row: MediaRow,
  now: number,
): Promise<boolean> {
  if (row.quarantined_at !== null) return false;
  if (row.completed_at !== null) return true;
  if (row.upload_id !== null) return false;
  const head = await bucket.head(row.key);
  if (head === null || head.size !== row.bytes) return false;
  await markCompleted(db, row.key, now);
  return true;
}
