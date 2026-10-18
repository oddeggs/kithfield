import type { FarmId, PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { deletableOf, deletableOnFarm, dropRows } from './index-store';

/*
 * Deleting media. The farm object deletes an unsent event's keys from R2 itself; these finish the
 * rest: the index rows after an unsend, everything a person uploaded when their account is
 * deleted, and everything on a farm that is gone. Quarantined evidence is never deleted here.
 * Each is safe to run again.
 */

/** R2 deletes at most 1000 keys a call. */
const R2_DELETE_BATCH = 1000;

async function deleteObjects(
  env: Pick<Bindings, 'MEDIA' | 'DB'>,
  rows: readonly { key: string; upload_id: string | null }[],
): Promise<number> {
  for (const row of rows) {
    if (row.upload_id === null) continue;
    // An unfinished multipart upload: abort it so its parts go too. Gone already is fine.
    await env.MEDIA.resumeMultipartUpload(row.key, row.upload_id)
      .abort()
      .catch(() => undefined);
  }
  const keys = rows.map((row) => row.key);
  for (let i = 0; i < keys.length; i += R2_DELETE_BATCH) {
    await env.MEDIA.delete(keys.slice(i, i + R2_DELETE_BATCH));
  }
  await dropRows(env.DB, keys);
  return keys.length;
}

/**
 * After an unsend or a safety removal deleted these keys from R2: forget them in the index.
 * The farm object calls it next to its `MEDIA.delete`.
 */
export const forgetMedia = (db: D1Database, keys: readonly string[]): Promise<void> =>
  dropRows(db, keys);

/**
 * Account deletion: deletes every object the person uploaded, on every farm and visit, and their
 * index rows. Answers how many objects went. Run it before the person's D1 rows are deleted.
 */
export async function deletePersonMedia(
  env: Pick<Bindings, 'MEDIA' | 'DB'>,
  person: PersonId,
): Promise<number> {
  return deleteObjects(env, await deletableOf(env.DB, person));
}

/** A farm that is gone: deletes every object on it that the index knows. */
export async function deleteFarmMedia(
  env: Pick<Bindings, 'MEDIA' | 'DB'>,
  farm: FarmId,
): Promise<number> {
  return deleteObjects(env, await deletableOnFarm(env.DB, farm));
}
