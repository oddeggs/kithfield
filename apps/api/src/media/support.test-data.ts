import {
  CompleteUploadResponse,
  ReadUrlsResponse,
  type UploadUrlRequest,
  UploadUrlResponse,
} from '@kithfield/contracts';
import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';

import { api, type Person } from '../../test/farm/support/doubles';

/* Shared steps for the media tests: the phone's side of an upload, as the app does it. */

export const uploadUrl = async (person: Person, req: UploadUrlRequest) => {
  const res = await api(person, 'POST', '/v1/media/upload-url', req);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return UploadUrlResponse.parse(res.body);
};

/** A PUT of `bytes` to a presigned URL; answers the status and the ETag. */
export const put = async (url: string, bytes: Uint8Array<ArrayBuffer>, type?: string) => {
  const res = await exports.default.fetch(url, {
    method: 'PUT',
    headers: {
      'content-length': String(bytes.byteLength),
      ...(type === undefined ? {} : { 'content-type': type }),
    },
    body: bytes,
  });
  await res.arrayBuffer();
  return { status: res.status, etag: res.headers.get('etag') };
};

export const complete = (
  person: Person,
  body: { key: string; uploadId: string; parts: { part: number; etag: string }[] },
) => api(person, 'POST', '/v1/media/complete', body);

export const completed = async (...args: Parameters<typeof complete>) => {
  const res = await complete(...args);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return CompleteUploadResponse.parse(res.body);
};

export const readUrls = async (person: Person, keys: string[]) => {
  const res = await api(person, 'POST', '/v1/media/read-urls', { keys });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return ReadUrlsResponse.parse(res.body).urls;
};

/** Bytes with a pattern, so a misplaced part would show. */
export const bytesOf = (length: number, seed = 1): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed) & 0xff;
  return out;
};

/** One small photo, uploaded by `person` to `farm`; answers its key. */
export const uploadPhoto = async (person: Person, farm: string, length = 2048) => {
  const bytes = bytesOf(length);
  const target = await uploadUrl(person, {
    farm,
    kind: 'photo',
    bytes: length,
    mime: 'image/jpeg',
  });
  if (target.upload !== 'single') throw new Error('expected a single upload');
  expect((await put(target.url, bytes, 'image/jpeg')).status).toBe(200);
  return target.key;
};

/** A SHA-256 of bytes or of an R2 object's body, to compare big uploads without copying them. */
export const digestOf = async (
  data: Uint8Array<ArrayBuffer> | R2ObjectBody | null,
): Promise<string> => {
  if (data === null) return 'missing';
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
};
