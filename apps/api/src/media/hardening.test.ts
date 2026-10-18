import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Bindings } from '../env';
import { api, cast, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import { mediaRow } from './index-store';
import { PART_BYTES } from './rules';
import { verifyReadUrl } from './signature';
import { bytesOf, completed, put, readUrls, uploadUrl } from './support.test-data';
import { uploadSigner } from './uploads';

beforeEach(() => {
  useTestPorts();
});

describe('what read URLs sign', () => {
  it('leaves out uploads that never finished, and signs a single PUT once its bytes are in', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const single = await uploadUrl(pip, { farm, kind: 'photo', bytes: 100, mime: 'image/png' });
    const parts = await uploadUrl(pip, {
      farm,
      kind: 'video',
      bytes: 6 * PART_BYTES,
      mime: 'video/mp4',
    });
    expect(await readUrls(pip, [single.key, parts.key])).toEqual([]);

    if (single.upload !== 'single') throw new Error('expected a single upload');
    expect((await put(single.url, bytesOf(100), 'image/png')).status).toBe(200);
    expect((await readUrls(pip, [single.key])).map((u) => u.key)).toEqual([single.key]);
    expect((await mediaRow(env.DB, single.key))?.completed_at).not.toBeNull();
  });
});

describe('a single PUT', () => {
  it('can’t overwrite an object once it is there', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const target = await uploadUrl(pip, { farm, kind: 'photo', bytes: 64, mime: 'image/png' });
    if (target.upload !== 'single') throw new Error('expected a single upload');
    expect((await put(target.url, bytesOf(64, 1), 'image/png')).status).toBe(200);
    expect((await put(target.url, bytesOf(64, 2), 'image/png')).status).toBe(412);
    const object = await env.MEDIA.get(target.key);
    expect(new Uint8Array((await object?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(
      bytesOf(64, 1),
    );
  });

  it('is presigned for R2 with “only if nothing is there” in its signed headers', async () => {
    const r2: Bindings = {
      ...env,
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
    };
    const signer = uploadSigner(r2, 'https://dev.kithfield.com');
    const url = new URL(
      (await signer?.putUrl({
        key: `farm/f/${crypto.randomUUID()}`,
        bytes: 10,
        mime: 'image/png',
        expiresAt: Date.now() + 60_000,
      })) ?? '',
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host;if-none-match',
    );
  });
});

describe('finishing a multipart upload', () => {
  it('answers 200 when R2 finished it but the API never heard', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const bytes = 5 * PART_BYTES + 7;
    const target = await uploadUrl(pip, { farm, kind: 'video', bytes, mime: 'video/mp4' });
    if (target.upload !== 'multipart') throw new Error('expected parts');
    const file = bytesOf(bytes, 3);
    const etags = [];
    for (const { part, url } of target.parts) {
      const slice = file.subarray((part - 1) * PART_BYTES, Math.min(bytes, part * PART_BYTES));
      etags.push({ part, etag: (await put(url, slice)).etag ?? '' });
    }
    // The first complete reached R2, then its answer was lost: the row still says unfinished.
    await completed(pip, { key: target.key, uploadId: target.uploadId, parts: etags });
    await env.DB.prepare(
      'UPDATE media_objects SET completed_at = NULL, upload_id = ? WHERE key = ?',
    )
      .bind(target.uploadId, target.key)
      .run();
    await completed(pip, { key: target.key, uploadId: target.uploadId, parts: etags });
    expect((await mediaRow(env.DB, target.key))?.completed_at).not.toBeNull();
  });
});

describe('cancelling an upload', () => {
  it('aborts a multipart upload for the uploader, and forgets it', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const target = await uploadUrl(pip, {
      farm,
      kind: 'video',
      bytes: 6 * PART_BYTES,
      mime: 'video/mp4',
    });
    if (target.upload !== 'multipart') throw new Error('expected parts');
    const body = { key: target.key, uploadId: target.uploadId };
    expect((await api(fig, 'POST', '/v1/media/abort', body)).status).toBe(404);
    expect((await api(pip, 'POST', '/v1/media/abort', body)).status).toBe(204);
    expect(await mediaRow(env.DB, target.key)).toBeNull();
    // Gone for R2 too: a part can't be added any more.
    const [first] = target.parts;
    expect((await put(first?.url ?? '', bytesOf(PART_BYTES))).status).not.toBe(200);
  });
});

describe('the upload limit', () => {
  it('hands out at most 60 upload URLs a minute to one person', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const req = { farm, kind: 'photo', bytes: 10, mime: 'image/png' };
    const statuses = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await api(pip, 'POST', '/v1/media/upload-url', req)).status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe('signed URLs', () => {
  it('refuses a path that doesn’t decode', async () => {
    const url = new URL(`https://media-dev.kithfield.com/farm/x/%E0%A4%A?exp=99999999999&sig=x`);
    expect(await verifyReadUrl(env.MEDIA_SIGNING_KEY ?? '', url, Date.now())).toBeNull();
  });
});
