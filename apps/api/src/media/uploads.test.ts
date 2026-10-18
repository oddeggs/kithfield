import { LIMITS } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, cast, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import { mediaRow } from './index-store';
import { PART_BYTES } from './rules';
import { verifyReadUrl } from './signature';
import {
  bytesOf,
  complete,
  completed,
  digestOf,
  put,
  readUrls,
  uploadPhoto,
  uploadUrl,
} from './support.test-data';

beforeEach(() => {
  useTestPorts();
});

describe('upload URLs', () => {
  it('hands a member a single PUT for a small photo, which lands in R2 and the index', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const bytes = bytesOf(4096);
    const target = await uploadUrl(pip, { farm, kind: 'photo', bytes: 4096, mime: 'image/jpeg' });
    expect(target.upload).toBe('single');
    expect(target.key).toMatch(new RegExp(`^farm/${farm}/[0-9a-f-]{36}$`));
    if (target.upload !== 'single') return;
    expect(target.expiresAt).toBeGreaterThan(Date.now());

    expect((await put(target.url, bytes, 'image/jpeg')).status).toBe(200);
    const object = await env.MEDIA.get(target.key);
    expect(object?.httpMetadata?.contentType).toBe('image/jpeg');
    expect(new Uint8Array((await object?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(bytes);
    expect(await mediaRow(env.DB, target.key)).toMatchObject({
      farm_id: farm,
      person_id: pip.id,
      kind: 'photo',
      bytes: 4096,
    });
  });

  it('refuses people who don’t live on the farm, and asks for a session', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip);
    const req = { farm, kind: 'photo', bytes: 10, mime: 'image/png' };
    expect((await api(fig, 'POST', '/v1/media/upload-url', req)).status).toBe(404);
    expect((await api(null, 'POST', '/v1/media/upload-url', req)).status).toBe(401);
  });

  it('holds each kind to its types and size', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const ask = (kind: string, mime: string, bytes: number) =>
      api(pip, 'POST', '/v1/media/upload-url', { farm, kind, bytes, mime });
    expect((await ask('photo', 'video/mp4', 10)).status).toBe(400);
    expect((await ask('voice', 'audio/mpeg', 10)).status).toBe(400);
    expect((await ask('voice', 'audio/mp4', 10)).status).toBe(200);
    expect((await ask('file', 'application/pdf', 10)).status).toBe(200);
    expect((await ask('photo', 'image/jpeg', 30 * 1024 * 1024)).status).toBe(413);
    // Over the contract's 100 MB, the body itself is refused.
    expect((await ask('file', 'application/pdf', LIMITS.uploadBytes + 1)).status).toBe(400);
  });
});

describe('the upload proxy', () => {
  it('takes only the size, type and object it signed, until it expires', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const target = await uploadUrl(pip, { farm, kind: 'photo', bytes: 100, mime: 'image/png' });
    if (target.upload !== 'single') throw new Error('expected a single upload');

    expect((await put(target.url, bytesOf(99), 'image/png')).status).toBe(400);
    expect((await put(target.url, bytesOf(100), 'image/jpeg')).status).toBe(400);
    const tampered = new URL(target.url);
    tampered.searchParams.set('bytes', '200');
    expect((await put(tampered.toString(), bytesOf(200), 'image/png')).status).toBe(403);
    const elsewhere = target.url.replace(/[0-9a-f-]{36}/, crypto.randomUUID());
    expect((await put(elsewhere, bytesOf(100), 'image/png')).status).toBe(403);
    const expired = new URL(target.url);
    expired.searchParams.set('exp', '1');
    expect((await put(expired.toString(), bytesOf(100), 'image/png')).status).toBe(403);

    expect((await put(target.url, bytesOf(100), 'image/png')).status).toBe(200);
  });
});

describe('multipart uploads', () => {
  const BIG = 5 * PART_BYTES + 1234;

  const startBig = async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const target = await uploadUrl(pip, { farm, kind: 'video', bytes: BIG, mime: 'video/mp4' });
    if (target.upload !== 'multipart') throw new Error('expected parts');
    const file = bytesOf(BIG, 7);
    const slice = (part: number) =>
      file.subarray((part - 1) * target.partBytes, Math.min(BIG, part * target.partBytes));
    return { pip, fig, farm, target, file, slice };
  };

  it('splits a big video into parts and joins them on complete', async () => {
    const { pip, target, file, slice } = await startBig();
    expect(target.partBytes).toBe(PART_BYTES);
    expect(target.parts.map((p) => p.part)).toEqual([1, 2, 3, 4, 5, 6]);

    const etags = [];
    for (const { part, url } of target.parts) {
      const sent = await put(url, slice(part));
      expect(sent.status).toBe(200);
      etags.push({ part, etag: sent.etag ?? '' });
    }
    await completed(pip, { key: target.key, uploadId: target.uploadId, parts: etags });
    const object = await env.MEDIA.get(target.key);
    expect(object?.size).toBe(BIG);
    expect(object?.httpMetadata?.contentType).toBe('video/mp4');
    expect(await digestOf(object)).toBe(await digestOf(file));
    expect((await mediaRow(env.DB, target.key))?.completed_at).not.toBeNull();

    // Completing again (a retry after a lost answer) answers the same.
    await completed(pip, { key: target.key, uploadId: target.uploadId, parts: etags });
  });

  it('resumes: parts sent before an interruption count, a part sent twice keeps one copy', async () => {
    const { pip, target, file, slice } = await startBig();
    const etags = new Map<number, string>();
    // The first run sends three parts, then the app is closed.
    for (const { part, url } of target.parts.slice(0, 3)) {
      etags.set(part, (await put(url, slice(part))).etag ?? '');
    }
    // The next run resends the third (its answer was lost) and the rest, with the same URLs.
    for (const { part, url } of target.parts.slice(2)) {
      etags.set(part, (await put(url, slice(part))).etag ?? '');
    }
    const parts = [...etags].map(([part, etag]) => ({ part, etag }));
    await completed(pip, { key: target.key, uploadId: target.uploadId, parts });
    expect(await digestOf(await env.MEDIA.get(target.key))).toBe(await digestOf(file));
  });

  it('refuses a complete with parts missing, from someone else, or for another upload', async () => {
    const { pip, fig, target, slice } = await startBig();
    const etags = [];
    for (const { part, url } of target.parts) {
      etags.push({ part, etag: (await put(url, slice(part))).etag ?? '' });
    }
    const { key, uploadId } = target;
    expect((await complete(pip, { key, uploadId, parts: etags.slice(1) })).status).toBe(400);
    expect((await complete(fig, { key, uploadId, parts: etags })).status).toBe(404);
    expect((await complete(pip, { key, uploadId: 'other', parts: etags })).status).toBe(404);
    const wrong = etags.map((e) => (e.part === 2 ? { ...e, etag: '"0000"' } : e));
    expect((await complete(pip, { key, uploadId, parts: wrong })).status).toBe(409);
    expect(await env.MEDIA.head(key)).toBeNull();
  });
});

describe('read URLs', () => {
  it('signs short-lived reads for members only, leaving out what they may not see', async () => {
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const { farm } = await plantFarm(pip, [fig]);
    const other = await plantFarm(bea);
    const key = await uploadPhoto(pip, farm);
    const beaKey = await uploadPhoto(bea, other.farm);
    const never = `farm/${farm}/${crypto.randomUUID()}`;

    const urls = await readUrls(fig, [key, beaKey, never, key]);
    expect(urls.map((u) => u.key)).toEqual([key]);
    const [read] = urls;
    if (read === undefined) throw new Error('no URL');
    const now = Date.now();
    expect(read.expiresAt - now).toBeGreaterThanOrEqual(29 * 60_000);
    expect(read.expiresAt - now).toBeLessThanOrEqual(60 * 60_000);
    const url = new URL(read.url);
    expect(url.origin).toBe(env.MEDIA_ORIGIN);
    expect(await verifyReadUrl(env.MEDIA_SIGNING_KEY ?? '', url, now)).toBe(key);
    expect(await verifyReadUrl(env.MEDIA_SIGNING_KEY ?? '', url, read.expiresAt)).toBeNull();

    expect(await readUrls(bea, [key])).toEqual([]);
    const bad = await api(fig, 'POST', '/v1/media/read-urls', { keys: ['farm/x/not-a-key'] });
    expect(bad.status).toBe(400);
  });
});
