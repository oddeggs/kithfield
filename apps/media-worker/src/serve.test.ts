import { readExpiry, signedReadUrl } from '@kithfield/api/src/media/signature';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { PHOTO_CACHE_CONTROL } from './serve';

const ORIGIN = 'https://media-dev.kithfield.com';
const secret = () => env.MEDIA_SIGNING_KEY ?? '';

let n = 0;
/** An object in the bucket with an index row, as an upload leaves it. */
const stored = async (type: string, body: string | Uint8Array, quarantined = false) => {
  const key = `farm/f${++n}/${crypto.randomUUID()}`;
  await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
  await env.DB.prepare(
    `INSERT INTO media_objects (key, farm_id, person_id, kind, mime, bytes, created_at, quarantined_at)
     VALUES (?, ?, 'p', 'photo', ?, 1, 0, ?)`,
  )
    .bind(key, `f${n}`, type, quarantined ? 1 : null)
    .run();
  return key;
};

const urlFor = (key: string, expiresAt = readExpiry(Date.now())) =>
  signedReadUrl(ORIGIN, secret(), key, expiresAt);

const get = (url: string, init?: RequestInit) => exports.default.fetch(url, init);

describe('signed reads', () => {
  it('serves a photo with headers that let the zone cache (and its CSAM scan) see it', async () => {
    const key = await stored('image/jpeg', 'jpeg bytes');
    const res = await get(await urlFor(key));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('jpeg bytes');
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe(PHOTO_CACHE_CONTROL);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    // Cached by object, not by signature: another valid URL for it hits the cache even after the
    // object is gone from R2.
    await env.MEDIA.delete(key);
    const again = await get(await urlFor(key, readExpiry(Date.now()) + 30 * 60_000));
    expect(again.status).toBe(200);
    expect(await again.text()).toBe('jpeg bytes');
  });

  it('refuses unsigned, tampered, expired and other-key URLs', async () => {
    const key = await stored('image/png', 'png');
    const url = new URL(await urlFor(key));
    expect((await get(`${ORIGIN}/${key}`)).status).toBe(403);
    const tampered = new URL(url);
    tampered.searchParams.set('exp', String(Number(url.searchParams.get('exp')) + 60));
    expect((await get(tampered.toString())).status).toBe(403);
    const other = await stored('image/png', 'other');
    expect((await get(url.toString().replace(key, other))).status).toBe(403);
    expect((await get(await urlFor(key, Date.now() - 1000))).status).toBe(403);
    expect((await get(url.toString(), { method: 'POST' })).status).toBe(405);
  });

  it('refuses a quarantined object, even once it was cached', async () => {
    const key = await stored('image/jpeg', 'flagged');
    const url = await urlFor(key);
    expect((await get(url)).status).toBe(200);
    await env.DB.prepare('UPDATE media_objects SET quarantined_at = 1 WHERE key = ?')
      .bind(key)
      .run();
    expect((await get(url)).status).toBe(404);
    expect((await get(await urlFor(await stored('image/png', 'x', true)))).status).toBe(404);
  });

  it('serves byte ranges of a video, privately', async () => {
    const key = await stored('video/mp4', '0123456789');
    const res = await get(await urlFor(key), { headers: { range: 'bytes=2-5' } });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe('2345');
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    const head = await get(await urlFor(key), { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
  });

  it('downloads anything that isn’t a photo, video or voice note as an attachment', async () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/pdf']) {
      const res = await get(await urlFor(await stored(type, '<script>1</script>')));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/octet-stream');
      expect(res.headers.get('content-disposition')).toBe('attachment');
      expect(res.headers.get('content-security-policy')).toContain('sandbox');
      await res.arrayBuffer();
    }
  });

  it('answers a missing object with 404 and a matching ETag with 304', async () => {
    const gone = `farm/f0/${crypto.randomUUID()}`;
    expect((await get(await urlFor(gone))).status).toBe(404);
    const key = await stored('audio/mp4', 'voice');
    const first = await get(await urlFor(key));
    await first.arrayBuffer();
    const etag = first.headers.get('etag') ?? '';
    const again = await get(await urlFor(key), { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });
});
