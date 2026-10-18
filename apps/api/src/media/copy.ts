import { CopyMediaRequest, type CopyMediaResponse } from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { roleOf } from '../farm/d1';
import { body, fail, signedIn } from '../farm/http';
import { isFinished, mediaRows, type MediaRow } from './index-store';
import { newKey } from './rules';
import { farmOfKey } from './signature';

/*
 * Forwarding a photo, a video, a voice note or a file copies it into the other farm rather than
 * sharing it: a key is only ever read on its own farm, and each farm's media is deleted with that
 * farm's events. The copy belongs to the forwarder.
 */

/** The copy this person already made of `from` on `farm`, or the one this call claims. */
async function claimCopy(db: D1Database, person: string, farm: string, from: string, now: number) {
  await db
    .prepare(
      `INSERT INTO media_copies (person_id, farm_id, from_key, to_key, created_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(person, farm, from, newKey(farm), now)
    .run();
  const row = await db
    .prepare('SELECT to_key FROM media_copies WHERE person_id = ? AND farm_id = ? AND from_key = ?')
    .bind(person, farm, from)
    .first<{ to_key: string }>();
  if (row === null) throw new Error('the copy row is missing');
  return row.to_key;
}

/** Copies the object (once) and records the copy in the media index as the forwarder's. */
async function copyObject(
  bucket: R2Bucket,
  db: D1Database,
  source: MediaRow,
  to: { key: string; farm: string; person: string; at: number },
): Promise<boolean> {
  if ((await bucket.head(to.key)) === null) {
    const object = await bucket.get(source.key);
    if (object === null) return false;
    await bucket.put(to.key, object.body, { httpMetadata: object.httpMetadata ?? {} });
  }
  await db
    .prepare(
      `INSERT INTO media_objects (key, farm_id, person_id, kind, mime, bytes, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING`,
    )
    .bind(to.key, to.farm, to.person, source.kind, source.mime, source.bytes, to.at, to.at)
    .run();
  return true;
}

export const copyRoute = (): Hono<SessionEnv> =>
  new Hono<SessionEnv>().post('/media/copy', signedIn, async (c) => {
    const req = await body(c, CopyMediaRequest);
    if (req instanceof Response) return req;
    const person = c.get('person');
    const keys = [...new Set(req.keys)];
    if (keys.some((key) => farmOfKey(key) !== req.fromFarm)) {
      return fail(c, 400, 'bad_request', ['keys']);
    }
    const [from, to] = await Promise.all([
      roleOf(c.env.DB, req.fromFarm, person),
      roleOf(c.env.DB, req.farm, person),
    ]);
    if (from === null || to === null) return fail(c, 404, 'not_found');
    if (!(await c.env.MEDIA_LIMIT.limit({ key: person })).success) {
      return fail(c, 429, 'rate_limited');
    }

    const now = Date.now();
    const rows = await mediaRows(c.env.DB, keys);
    const sources: MediaRow[] = [];
    for (const key of keys) {
      const row = rows.get(key);
      // Only what was finished and may be read: never an unfinished or quarantined upload.
      if (row === undefined || !(await isFinished(c.env.DB, c.env.MEDIA, row, now))) {
        return fail(c, 404, 'not_found');
      }
      sources.push(row);
    }
    const copies: Record<string, string> = {};
    for (const source of sources) {
      const toKey = await claimCopy(c.env.DB, person, req.farm, source.key, now);
      const copied = await copyObject(c.env.MEDIA, c.env.DB, source, {
        key: toKey,
        farm: req.farm,
        person,
        at: now,
      });
      if (!copied) return fail(c, 404, 'not_found');
      copies[source.key] = toKey;
    }
    return c.json({ keys: copies } satisfies CopyMediaResponse);
  });
