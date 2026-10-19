import { MIN_SIGNING_KEY_LENGTH, verifyReadUrl } from '@kithfield/api/src/media/signature';

/*
 * One signed read: `GET <media host>/<key>?exp=&sig=`. The URL must be signed by the API with
 * `MEDIA_SIGNING_KEY` and unexpired, and the key must be in the media index and not quarantined
 * (checked on every request, cache hits included, so a quarantine takes effect at once). A cached
 * photo is served only while R2 still has it, so an unsend or a deletion takes effect at once too.
 *
 * Photos are cached on the zone (Cache API, keyed by the object alone, never by the signature) with
 * public cache headers on the zone's copy only: that is where Cloudflare's CSAM Scanning Tool
 * hashes images. Video, voice
 * notes and files are served from R2 with byte ranges, for players and Quick Look.
 */

export interface MediaEnv {
  readonly ENVIRONMENT: 'dev' | 'prd';
  readonly MEDIA: R2Bucket;
  /** The API's database: the media index's quarantine flag. */
  readonly DB: D1Database;
  /** The API's `MEDIA_SIGNING_KEY`. */
  readonly MEDIA_SIGNING_KEY?: string;
}

/** Types shown inline; anything else downloads as an attachment, never rendered on this origin. */
const INLINE =
  /^(image\/(jpeg|png|heic|heif|webp|gif)|video\/(mp4|quicktime)|audio\/(mp4|m4a|x-m4a|aac))$/;

/** Photos: cached on the zone, where the CSAM scanning sees them. */
const CACHED = /^image\/(jpeg|png|heic|heif|webp|gif)$/;

/**
 * The zone's copy of a photo: a key's bytes never change (a new upload is a new key), so it can
 * live a day. Only the zone's copy says public; phones and browsers are told `private`, so no
 * shared cache keeps a photo past its signed URL, an unsend or a quarantine.
 */
export const PHOTO_CACHE_CONTROL = 'public, max-age=86400, immutable';
export const PRIVATE_CACHE_CONTROL = 'private, max-age=3600';

const plain = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store', ...extra } });

/** Whether the media index has the key and it isn't quarantined. */
const servable = async (db: D1Database, key: string): Promise<boolean> => {
  const row = await db
    .prepare('SELECT quarantined_at FROM media_objects WHERE key = ?')
    .bind(key)
    .first<{ quarantined_at: number | null }>();
  return row !== null && row.quarantined_at === null;
};

/** The headers every object answer carries, from what R2 holds. */
function objectHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const type = object.httpMetadata?.contentType ?? 'application/octet-stream';
  if (!INLINE.test(type)) {
    headers.set('content-type', 'application/octet-stream');
    headers.set('content-disposition', 'attachment');
  }
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', PRIVATE_CACHE_CONTROL);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  headers.set('cross-origin-resource-policy', 'cross-origin');
  headers.set('referrer-policy', 'no-referrer');
  return headers;
}

export async function serveMedia(
  request: Request,
  env: MediaEnv,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  now = Date.now(),
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return plain(405, { allow: 'GET, HEAD' });
  }
  const secret = env.MEDIA_SIGNING_KEY;
  if (secret === undefined || secret.length < MIN_SIGNING_KEY_LENGTH) return plain(503);
  const url = new URL(request.url);
  const key = await verifyReadUrl(secret, url, now);
  if (key === null) return plain(403);
  if (!(await servable(env.DB, key))) return plain(404);

  // The zone's cache. Typed by hand: the test types bring the DOM's `CacheStorage` along.
  const cache = (caches as unknown as { readonly default: Cache }).default;
  const cacheKey = new Request(`${url.origin}/${key}`, { method: 'GET' });
  const whole = !request.headers.has('range');
  if (whole) {
    const hit = await cache.match(cacheKey);
    if (hit !== undefined) {
      // Unsent or deleted since it was cached: drop the copy rather than serve it.
      if ((await env.MEDIA.head(key)) === null) {
        await hit.body?.cancel();
        await cache.delete(cacheKey);
        return plain(404);
      }
      const served = new Response(request.method === 'HEAD' ? null : hit.body, hit);
      served.headers.set('cache-control', PRIVATE_CACHE_CONTROL);
      return served;
    }
  }

  if (request.method === 'HEAD') {
    const head = await env.MEDIA.head(key);
    if (head === null) return plain(404);
    const headers = objectHeaders(head);
    headers.set('content-length', String(head.size));
    return new Response(null, { headers });
  }

  const object = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (object === null) return plain(404);
  const headers = objectHeaders(object);
  if (!('body' in object)) return new Response(null, { status: 304, headers });

  const range = object.range as { offset?: number; length?: number } | undefined;
  if (!whole && range !== undefined) {
    const offset = range.offset ?? 0;
    const length = range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  const response = new Response(object.body, { headers });
  if (CACHED.test(object.httpMetadata?.contentType ?? '')) {
    const copy = response.clone();
    const zone = new Response(copy.body, copy);
    zone.headers.set('cache-control', PHOTO_CACHE_CONTROL);
    ctx.waitUntil(cache.put(cacheKey, zone));
  }
  return response;
}
