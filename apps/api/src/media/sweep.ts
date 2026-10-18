import type { Bindings } from '../env';
import { dropRows, isFinished, type MediaRow } from './index-store';

/*
 * The daily media sweep. R2 aborts multipart uploads after 7 days on its own, but the index would
 * keep their rows, and an upload that finished but was never sent (the app was deleted mid-way)
 * would keep its object for ever. Quarantined evidence is never touched.
 */

/** Unfinished or unsent this long, an upload is given up on. */
export const ABANDONED_MS = 7 * 24 * 60 * 60_000;
/** Rows looked at per kind per run; the next day's run takes the rest. */
const BATCH = 500;

/**
 * Records that farm events now point at these keys (a message, a voice note, a link preview).
 * The farm object calls it as it commits one; the sweep keeps what it marked.
 */
export async function markMediaReferenced(
  db: D1Database,
  keys: readonly string[],
  at: number,
): Promise<void> {
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    await db
      .prepare(
        `UPDATE media_objects SET referenced_at = ? WHERE referenced_at IS NULL AND key IN (${chunk
          .map(() => '?')
          .join(', ')})`,
      )
      .bind(at, ...chunk)
      .run();
  }
}

export interface SweepOptions {
  /**
   * Also delete finished uploads nothing pointed at within the week. Only once the farm object
   * marks what its events reference (`markMediaReferenced`); until then every upload looks unsent.
   */
  readonly unreferenced?: boolean;
}

export interface SweepResult {
  /** Unfinished uploads given up on. */
  readonly abandoned: number;
  /** Finished uploads nothing pointed at, deleted. */
  readonly unsent: number;
}

const COLUMNS =
  'key, farm_id, person_id, kind, mime, bytes, upload_id, created_at, completed_at, quarantined_at, report_id, referenced_at';

export async function sweepMedia(
  env: Pick<Bindings, 'DB' | 'MEDIA'>,
  now: number,
  options: SweepOptions = {},
): Promise<SweepResult> {
  const cutoff = now - ABANDONED_MS;
  const { results: stale } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM media_objects
     WHERE completed_at IS NULL AND quarantined_at IS NULL AND created_at < ? LIMIT ?`,
  )
    .bind(cutoff, BATCH)
    .all<MediaRow>();
  const abandoned: string[] = [];
  for (const row of stale) {
    // A single PUT that landed is finished, not abandoned (`isFinished` marks it so).
    if (await isFinished(env.DB, env.MEDIA, row, now)) continue;
    if (row.upload_id !== null) {
      await env.MEDIA.resumeMultipartUpload(row.key, row.upload_id)
        .abort()
        .catch(() => undefined);
    }
    abandoned.push(row.key);
  }

  let unsent: string[] = [];
  if (options.unreferenced === true) {
    const { results } = await env.DB.prepare(
      `SELECT key FROM media_objects
       WHERE completed_at IS NOT NULL AND referenced_at IS NULL AND quarantined_at IS NULL
         AND created_at < ? LIMIT ?`,
    )
      .bind(cutoff, BATCH)
      .all<{ key: string }>();
    unsent = results.map((r) => r.key);
  }

  const gone = [...abandoned, ...unsent];
  for (let i = 0; i < gone.length; i += 1000) await env.MEDIA.delete(gone.slice(i, i + 1000));
  await dropRows(env.DB, gone);
  return { abandoned: abandoned.length, unsent: unsent.length };
}
