import {
  CompleteUploadRequest,
  type CompleteUploadResponse,
  MediaKey,
  UploadUrlRequest,
  type UploadUrlResponse,
} from '@kithfield/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import type { SessionEnv } from '../auth';
import { roleOf } from '../farm/d1';
import { body, type Ctx, fail, sessionOrActionKey } from '../farm/http';
import { copyRoute } from './copy';
import { dropRow, markCompleted, mediaRow, recordUpload } from './index-store';
import { proxyRoute } from './proxy-route';
import { readRoute } from './read-route';
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
import { bindingEtags, dropProxyParts } from './proxy-parts';
import { proxyEnabled, uploadSigner } from './uploads';

/*
 * The media routes, mounted at `/v1`: upload URLs, finishing and cancelling an upload, signed
 * reads, forwarding copies and, in development only, the upload proxy (`uploads.ts`).
 */

/** An S3 ETag arrives quoted; R2's binding wants the bare value. */
const bareEtag = (etag: string) => etag.replace(/^W\//, '').replace(/^"|"$/g, '');

/** Upload URLs and copies a person may ask for: 60 a minute. False (answer 429) once over. */
export const withinMediaLimit = async (c: Ctx, person: string) =>
  (await c.env.MEDIA_LIMIT.limit({ key: person })).success;

/** `POST /v1/media/abort`: the uploader gives up on an upload before its message is sent. */
export const AbortUploadRequest = z.object({
  key: MediaKey,
  uploadId: z.string().min(1).max(512).optional(),
});

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
    if (!(await withinMediaLimit(c, person))) return fail(c, 429, 'rate_limited');
    if (!mimeFits(req.kind, req.mime)) return fail(c, 400, 'bad_request', ['mime']);
    if (req.bytes > MAX_BYTES[req.kind]) return fail(c, 413, 'too_large', ['bytes']);
    const signer = uploadSigner(
      c.env,
      c.env.MEDIA_UPLOAD_PROXY_ORIGIN ?? new URL(c.req.url).origin,
    );
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
      // R2 may have finished it on an earlier try whose answer was lost: then the object is there.
      const head = await c.env.MEDIA.head(row.key);
      if (head === null || head.size !== row.bytes) {
        // A part missing or uploaded with another ETag, or an upload R2 no longer has.
        console.warn('multipart complete refused', { error });
        return fail(c, 409, 'conflict', ['parts']);
      }
      size = head.size;
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
   * Cancels an upload the uploader no longer wants: aborts its multipart upload (so R2 drops the
   * parts), deletes whatever single PUT landed, and forgets the key. Only before anything points at
   * it.
   */
  app.post('/media/abort', sessionOrActionKey, async (c) => {
    const req = await body(c, AbortUploadRequest);
    if (req instanceof Response) return req;
    const row = await mediaRow(c.env.DB, req.key);
    if (
      row === null ||
      row.person_id !== c.get('person') ||
      row.quarantined_at !== null ||
      row.referenced_at !== null ||
      (row.upload_id !== null && row.upload_id !== req.uploadId)
    ) {
      return fail(c, 404, 'not_found');
    }
    if (row.upload_id !== null) {
      await c.env.MEDIA.resumeMultipartUpload(row.key, row.upload_id)
        .abort()
        .catch(() => undefined);
    }
    await c.env.MEDIA.delete(row.key);
    await dropRow(c.env.DB, row.key);
    return c.body(null, 204);
  });

  return app.route('/', readRoute()).route('/', copyRoute()).route('/', proxyRoute());
};
