import {
  CompleteUploadRequest,
  LIMITS,
  ReadUrlsRequest,
  type CompleteUploadResponse,
  type ReadUrlsResponse,
  UploadUrlRequest,
  type UploadUrlResponse,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { roleOf } from '../farm/d1';
import { body, fail, sessionOrActionKey, signedIn } from '../farm/http';
import { markCompleted, mediaRow, mediaRows, recordUpload } from './index-store';
import {
  isMultipart,
  MAX_BYTES,
  MULTIPART_URL_MS,
  mimeFits,
  newKey,
  PART_BYTES,
  partSizes,
  SINGLE_URL_MS,
} from './rules';
import {
  farmOfKey,
  MEDIA_KEY,
  MIN_SIGNING_KEY_LENGTH,
  readExpiry,
  signedReadUrl,
} from './signature';
import { bindingEtags, dropProxyParts, putProxyPart } from './proxy-parts';
import { PROXY_PATH, proxyEnabled, uploadSigner, verifyProxyPut } from './uploads';

/*
 * The media routes, mounted at `/v1`: upload URLs, finishing a multipart upload, signed reads and,
 * in development only, the upload proxy (`uploads.ts`).
 */

/** An S3 ETag arrives quoted; R2's binding wants the bare value. */
const bareEtag = (etag: string) => etag.replace(/^W\//, '').replace(/^"|"$/g, '');

export const mediaRoutes = (): Hono<SessionEnv> => {
  const app = new Hono<SessionEnv>();

  /**
   * A presigned PUT for one object, or presigned parts above 50 MB. The share extension sends
   * media with its device's action key, so the key works here too.
   */
  app.post('/media/upload-url', sessionOrActionKey, async (c) => {
    const req = await body(c, UploadUrlRequest);
    if (req instanceof Response) return req;
    const person = c.get('person');
    if ((await roleOf(c.env.DB, req.farm, person)) === null) return fail(c, 404, 'not_found');
    if (!mimeFits(req.kind, req.mime)) return fail(c, 400, 'bad_request', ['mime']);
    if (req.bytes > MAX_BYTES[req.kind]) return fail(c, 413, 'too_large', ['bytes']);
    const signer = uploadSigner(c.env, new URL(c.req.url).origin);
    if (signer === null) return fail(c, 503, 'unavailable');

    const now = Date.now();
    const key = newKey(req.farm);
    if (!isMultipart(req.bytes)) {
      const expiresAt = now + SINGLE_URL_MS;
      const url = await signer.putUrl({ key, bytes: req.bytes, mime: req.mime, expiresAt });
      await recordUpload(c.env.DB, { ...req, key, person, uploadId: null, at: now });
      return c.json({ upload: 'single', key, url, expiresAt } satisfies UploadUrlResponse);
    }

    const upload = await c.env.MEDIA.createMultipartUpload(key, {
      httpMetadata: { contentType: req.mime },
    });
    const expiresAt = now + MULTIPART_URL_MS;
    const parts = await Promise.all(
      partSizes(req.bytes).map(async (bytes, i) => ({
        part: i + 1,
        url: await signer.putUrl({
          key,
          bytes,
          mime: req.mime,
          part: { uploadId: upload.uploadId, number: i + 1 },
          expiresAt,
        }),
      })),
    );
    await recordUpload(c.env.DB, { ...req, key, person, uploadId: upload.uploadId, at: now });
    return c.json({
      upload: 'multipart',
      key,
      uploadId: upload.uploadId,
      partBytes: PART_BYTES,
      parts,
      expiresAt,
    } satisfies UploadUrlResponse);
  });

  /** Finishes a multipart upload with each part's ETag. Safe to repeat once it has finished. */
  app.post('/media/complete', sessionOrActionKey, async (c) => {
    const req = await body(c, CompleteUploadRequest);
    if (req instanceof Response) return req;
    const person = c.get('person');
    const row = await mediaRow(c.env.DB, req.key);
    if (row === null || row.person_id !== person || row.quarantined_at !== null) {
      return fail(c, 404, 'not_found');
    }
    if ((await roleOf(c.env.DB, row.farm_id, person)) === null) return fail(c, 404, 'not_found');
    if (row.completed_at !== null) {
      return c.json({ key: row.key } satisfies CompleteUploadResponse);
    }
    if (row.upload_id !== req.uploadId) return fail(c, 404, 'not_found');

    const expected = partSizes(row.bytes).length;
    const parts = [...req.parts].sort((a, b) => a.part - b.part);
    if (parts.length !== expected || parts.some((p, i) => p.part !== i + 1)) {
      return fail(c, 400, 'bad_request', ['parts']);
    }
    const proxied = proxyEnabled(c.env);
    let etags = parts.map((p) => ({ partNumber: p.part, etag: bareEtag(p.etag) }));
    if (proxied) etags = await bindingEtags(c.env.MEDIA, req.uploadId, etags);
    let size: number;
    try {
      const done = await c.env.MEDIA.resumeMultipartUpload(row.key, req.uploadId).complete(etags);
      size = done.size;
    } catch (error) {
      // A part missing or uploaded with another ETag, or an upload R2 no longer has.
      console.warn('multipart complete refused', { error });
      return fail(c, 409, 'conflict', ['parts']);
    }
    if (size !== row.bytes) {
      await c.env.MEDIA.delete(row.key);
      return fail(c, 400, 'bad_request', ['bytes']);
    }
    await markCompleted(c.env.DB, row.key, Date.now());
    if (proxied) await dropProxyParts(c.env.MEDIA, req.uploadId, parts.length);
    return c.json({ key: row.key } satisfies CompleteUploadResponse);
  });

  /**
   * Signed, short-lived read URLs on the media Worker. Only keys on farms the caller lives on, that
   * were uploaded through these routes and aren't quarantined, are signed; others are left out,
   * so one stale key never fails a screenful.
   */
  app.post('/media/read-urls', signedIn, async (c) => {
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
    const expiresAt = readExpiry(Date.now());
    const urls: ReadUrlsResponse['urls'] = [];
    for (const key of keys) {
      const farm = farmOfKey(key);
      const row = rows.get(key);
      if (farm === null || row === undefined || row.quarantined_at !== null) continue;
      if (!member.has(farm)) member.set(farm, (await roleOf(c.env.DB, farm, person)) !== null);
      if (member.get(farm) !== true) continue;
      urls.push({
        key,
        url: await signedReadUrl(c.env.MEDIA_ORIGIN, secret, key, expiresAt),
        expiresAt,
      });
    }
    return c.json({ urls } satisfies ReadUrlsResponse);
  });

  /**
   * The development upload proxy: a PUT to a URL the routes above signed, written through the R2
   * binding. Answers like R2 does: 200 with the ETag. Not served where presigning works.
   */
  app.put(`${PROXY_PATH}/farm/:farm/:id`, async (c) => {
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
      const object = await c.env.MEDIA.put(key, stream, {
        httpMetadata: { contentType: target.mime },
      });
      c.header('ETag', `"${object?.etag ?? ''}"`);
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

  return app;
};
