import { LIMITS } from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { fail } from '../farm/http';
import { putProxyPart } from './proxy-parts';
import { MEDIA_KEY } from './signature';
import { PROXY_PATH, proxyEnabled, verifyProxyPut } from './uploads';

/**
 * The development upload proxy: a PUT to a URL the upload routes signed, written through the R2
 * binding. Answers like R2 does: 200 with the ETag, and 412 when a single PUT finds its object
 * already there. Not served where presigning works (`uploads.ts`).
 */
export const proxyRoute = (): Hono<SessionEnv> =>
  new Hono<SessionEnv>().put(`${PROXY_PATH}/farm/:farm/:id`, async (c) => {
    if (!proxyEnabled(c.env)) return fail(c, 404, 'not_found');
    const key = `farm/${c.req.param('farm')}/${c.req.param('id')}`;
    if (!MEDIA_KEY.test(key)) return fail(c, 404, 'not_found');
    const target = await verifyProxyPut(c.env, key, new URL(c.req.url).searchParams, Date.now());
    if (target === null) return fail(c, 403, 'forbidden');
    const length = Number(c.req.header('content-length'));
    const stream = c.req.raw.body;
    if (length !== target.bytes || stream === null) return fail(c, 400, 'bad_request', ['bytes']);
    if (target.bytes > LIMITS.uploadBytes) return fail(c, 413, 'too_large');

    if (target.part === undefined) {
      if (c.req.header('content-type') !== target.mime) {
        return fail(c, 400, 'bad_request', ['content-type']);
      }
      // Only if nothing is there yet, as the presigned PUT's `if-none-match: *` asks of R2.
      const object = await c.env.MEDIA.put(key, stream, {
        httpMetadata: { contentType: target.mime },
        onlyIf: new Headers({ 'if-none-match': '*' }),
      });
      if (object === null) return c.body(null, 412);
      c.header('ETag', `"${object.etag}"`);
      return c.body(null, 200);
    }
    try {
      const { uploadId, number } = target.part;
      const part = await c.req.arrayBuffer();
      if (part.byteLength !== target.bytes) return fail(c, 400, 'bad_request', ['bytes']);
      c.header('ETag', `"${await putProxyPart(c.env.MEDIA, key, uploadId, number, part)}"`);
      return c.body(null, 200);
    } catch (error) {
      console.warn('upload part refused', { error });
      return fail(c, 404, 'not_found');
    }
  });
