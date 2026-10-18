import { ReadUrlsRequest, type ReadUrlsResponse } from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { roleOf } from '../farm/d1';
import { body, fail, signedIn } from '../farm/http';
import { isFinished, mediaRows } from './index-store';
import { farmOfKey, MIN_SIGNING_KEY_LENGTH, readExpiry, signedReadUrl } from './signature';

/**
 * `POST /v1/media/read-urls`: signed, short-lived read URLs on the media Worker. Only keys on farms
 * the caller lives on, uploaded through these routes, finished and not quarantined, are signed;
 * others are left out, so one stale key never fails a screenful.
 */
export const readRoute = (): Hono<SessionEnv> =>
  new Hono<SessionEnv>().post('/media/read-urls', signedIn, async (c) => {
    const req = await body(c, ReadUrlsRequest);
    if (req instanceof Response) return req;
    const secret = c.env.MEDIA_SIGNING_KEY;
    if (secret === undefined || secret.length < MIN_SIGNING_KEY_LENGTH) {
      return fail(c, 503, 'unavailable');
    }
    const person = c.get('person');
    const keys = [...new Set(req.keys)];
    const rows = await mediaRows(c.env.DB, keys);
    const member = new Map<string, boolean>();
    const now = Date.now();
    const expiresAt = readExpiry(now);
    const urls: ReadUrlsResponse['urls'] = [];
    for (const key of keys) {
      const farm = farmOfKey(key);
      const row = rows.get(key);
      if (farm === null || row === undefined) continue;
      if (!member.has(farm)) member.set(farm, (await roleOf(c.env.DB, farm, person)) !== null);
      if (member.get(farm) !== true) continue;
      if (!(await isFinished(c.env.DB, c.env.MEDIA, row, now))) continue;
      urls.push({
        key,
        url: await signedReadUrl(c.env.MEDIA_ORIGIN, secret, key, expiresAt),
        expiresAt,
      });
    }
    return c.json({ urls } satisfies ReadUrlsResponse);
  });
