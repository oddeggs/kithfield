import { LIMITS, type UploadUrlRequest } from '@kithfield/contracts';

/*
 * What may be uploaded: each kind's types and size, the multipart plan and URL lifetimes. The
 * contract caps everything at 100 MB with parts above 50 MB; the phone resizes photos (2048 px on
 * the long side), compresses video when it is picked and records voice notes as AAC, so the
 * smaller kinds get tighter caps.
 */

export type MediaKind = UploadUrlRequest['kind'];

/** Types each kind accepts. Files take anything the contract's mime pattern allows. */
const TYPES: Readonly<Record<Exclude<MediaKind, 'file'>, readonly string[]>> = {
  photo: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/quicktime'],
  voice: ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac'],
};

/** The most each kind may weigh. */
export const MAX_BYTES: Readonly<Record<MediaKind, number>> = {
  // A 2048 px photo is well under 5 MB; a GIF can be bigger.
  photo: 25 * 1024 * 1024,
  video: LIMITS.uploadBytes,
  // Five minutes of AAC at 128 kbit/s is under 5 MB.
  voice: 10 * 1024 * 1024,
  file: LIMITS.uploadBytes,
};

export const mimeFits = (kind: MediaKind, mime: string): boolean =>
  kind === 'file' ? true : TYPES[kind].includes(mime);

/** Parts of a multipart upload: 10 MiB each (R2 wants 5 MiB or more, all equal but the last). */
export const PART_BYTES = 10 * 1024 * 1024;

/** Whether an upload of `bytes` goes up in parts. */
export const isMultipart = (bytes: number): boolean => bytes > LIMITS.multipartAboveBytes;

/** The byte length of each part, in order. */
export function partSizes(bytes: number, partBytes = PART_BYTES): number[] {
  const count = Math.ceil(bytes / partBytes);
  return Array.from({ length: count }, (_, i) =>
    i < count - 1 ? partBytes : bytes - partBytes * (count - 1),
  );
}

/** A single PUT URL lives an hour: the phone starts it at once. */
export const SINGLE_URL_MS = 60 * 60_000;

/**
 * Part URLs live a day, so an upload interrupted by a weak signal or a closed app can resume its
 * missing parts without asking again. R2 aborts unfinished multipart uploads after 7 days.
 */
export const MULTIPART_URL_MS = 24 * 60 * 60_000;

/** A new object key on the farm. */
export const newKey = (farm: string): string => `farm/${farm}/${crypto.randomUUID()}`;
