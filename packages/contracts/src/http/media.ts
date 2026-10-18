import { z } from 'zod';

import { EpochMs, FarmId, HttpUrl, LIMITS, MediaKey } from '../primitives';

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
