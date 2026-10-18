import { z } from 'zod';

import { EpochMs, FarmId, HttpUrl, Id, LIMITS, MediaKey, text } from '../primitives';

/** `POST /v1/media/upload-url`. */
export const UploadUrlRequest = z.object({
  farm: FarmId,
  kind: z.enum(['photo', 'video', 'voice', 'file']),
  bytes: z.int().min(1).max(LIMITS.uploadBytes),
  mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]{1,80}$/),
});
export type UploadUrlRequest = z.infer<typeof UploadUrlRequest>;

/** A single presigned PUT, or presigned parts above 50 MB. */
export const UploadUrlResponse = z.discriminatedUnion('upload', [
  z.object({
    upload: z.literal('single'),
    key: MediaKey,
    url: HttpUrl,
    expiresAt: EpochMs,
  }),
  z.object({
    upload: z.literal('multipart'),
    key: MediaKey,
    uploadId: z.string().min(1).max(512),
    partBytes: z.int().min(5 * 1024 * 1024),
    parts: z
      .array(z.object({ part: z.int().min(1), url: HttpUrl }))
      .min(1)
      .max(10_000),
    expiresAt: EpochMs,
  }),
]);
export type UploadUrlResponse = z.infer<typeof UploadUrlResponse>;

/** `POST /v1/media/complete`: finish a multipart upload with each part's ETag. */
export const CompleteUploadRequest = z.object({
  key: MediaKey,
  uploadId: z.string().min(1).max(512),
  parts: z
    .array(z.object({ part: z.int().min(1), etag: z.string().min(1).max(128) }))
    .min(1)
    .max(10_000),
});
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequest>;

export const CompleteUploadResponse = z.object({ key: MediaKey });
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponse>;

/** `POST /v1/media/read-urls`: short-lived signed reads, checked against membership. */
export const ReadUrlsRequest = z.object({ keys: z.array(MediaKey).min(1).max(50) });
export type ReadUrlsRequest = z.infer<typeof ReadUrlsRequest>;

export const ReadUrlsResponse = z.object({
  urls: z.array(z.object({ key: MediaKey, url: HttpUrl, expiresAt: EpochMs })).max(50),
});
export type ReadUrlsResponse = z.infer<typeof ReadUrlsResponse>;

/** `POST /v1/media/abort`: the uploader gives up on an upload before its message is sent. 204. */
export const AbortUploadRequest = z.object({
  key: MediaKey,
  uploadId: z.string().min(1).max(512).optional(),
});
export type AbortUploadRequest = z.infer<typeof AbortUploadRequest>;

/**
 * `POST /v1/media/copy`: forwarding copies finished media from one farm the caller lives on into
 * another; the forward then names the copies, never the originals.
 */
export const CopyMediaRequest = z.object({
  fromFarm: FarmId,
  keys: z.array(MediaKey).min(1).max(LIMITS.mediaItems),
  farm: FarmId,
});
export type CopyMediaRequest = z.infer<typeof CopyMediaRequest>;

/** Each original key with its copy on the other farm. */
export const CopyMediaResponse = z.object({
  keys: z
    .record(MediaKey, MediaKey)
    .refine((k) => Object.keys(k).length <= LIMITS.mediaItems, { message: 'Too many keys' }),
});
export type CopyMediaResponse = z.infer<typeof CopyMediaResponse>;

/**
 * `POST /admin/v1/media/quarantine` (the safety desk, behind Access): a media key or the URL
 * Cloudflare's CSAM notice names, and a note. `hash_match` for the scanning tool, `member` when a
 * moderator found it.
 */
export const MediaQuarantineRequest = z
  .object({
    key: MediaKey.optional(),
    url: z.url().max(2048).optional(),
    source: z.enum(['hash_match', 'member']).default('hash_match'),
    note: text(500).optional(),
  })
  .refine((r) => (r.key === undefined) !== (r.url === undefined), {
    message: 'A key or a url, not both',
  });
export type MediaQuarantineRequest = z.infer<typeof MediaQuarantineRequest>;

/** The object is held at `evidence`; `report` is the urgent report the desk opened. */
export const MediaQuarantineResponse = z.object({
  key: MediaKey,
  evidence: z.string().regex(/^quarantine\/farm\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/),
  /** False when the key was already quarantined. */
  first: z.boolean(),
  /** Whether the evidence is held (the object existed, here or already moved). */
  held: z.boolean(),
  report: Id.nullable(),
});
export type MediaQuarantineResponse = z.infer<typeof MediaQuarantineResponse>;
