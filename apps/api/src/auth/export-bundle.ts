import type { Bindings } from '../env';
import type { FarmExport } from '../farm/export';
import { farmStub } from '../farm/http';
import { type ZipEntry, writeZip, zipLength } from './export-zip';

/*
 * Builds a person's keepsakes bundle: `messages.json` (what they wrote on each farm they live or
 * lived on, as last edited), `media.json` (the keys of what they shared, and which files are in the zip),
 * and the media files themselves under `media/`, streamed from R2 one at a time so memory stays
 * flat. Media past `MEDIA_CAP_BYTES` or `MEDIA_CAP_FILES` is listed but not copied.
 */

/** Media copied into one bundle at most; the rest is listed in `media.json` only. */
export const MEDIA_CAP_BYTES = 512 * 1024 * 1024;
/** Media files in one bundle at most, so the zip stays within its 65,535 entries without zip64. */
export const MEDIA_CAP_FILES = 60_000;

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
  'application/pdf': '.pdf',
};

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/** The farms the person lives on or has lived on, with what they wrote there. */
async function farmsOf(env: Bindings, person: string): Promise<FarmExport[]> {
  const { results } = await env.DB.prepare(
    'SELECT farm_id FROM memberships WHERE person_id = ? ORDER BY joined_at',
  )
    .bind(person)
    .all<{ farm_id: string }>();
  const farms: FarmExport[] = [];
  for (const { farm_id } of results) {
    const share = await farmStub(env, farm_id).exportFor(person);
    if (share !== null) farms.push(share);
  }
  return farms;
}

/** Writes the bundle to R2 at `key`. Safe to run again: a rerun overwrites the same object. */
export async function writeBundle(
  env: Bindings,
  input: { person: string; key: string; at: number },
): Promise<void> {
  const farms = await farmsOf(env, input.person);
  const keys = [...new Set(farms.flatMap((f) => f.items.flatMap((item) => item.media)))];
  const included: { key: string; file: string; bytes: number }[] = [];
  const media: ZipEntry[] = [];
  const missing: string[] = [];
  const notIncluded: string[] = [];
  let total = 0;
  for (const key of keys) {
    const head = await env.MEDIA.head(key);
    if (head === null) {
      missing.push(key);
      continue;
    }
    if (total + head.size > MEDIA_CAP_BYTES || included.length >= MEDIA_CAP_FILES) {
      notIncluded.push(key);
      continue;
    }
    total += head.size;
    const file = `media/${key.replace(/^farm\//, '')}${EXTENSIONS[head.httpMetadata?.contentType ?? ''] ?? ''}`;
    included.push({ key, file, bytes: head.size });
    media.push({
      name: file,
      size: head.size,
      open: async () => {
        const object = await env.MEDIA.get(key);
        if (object === null) throw new Error('a media file went missing during the export');
        return object.body;
      },
    });
  }
  const entries: ZipEntry[] = [
    { name: 'messages.json', bytes: json({ person: input.person, exportedAt: input.at, farms }) },
    { name: 'media.json', bytes: json({ included, missing, notIncluded }) },
    ...media,
  ];
  const { readable, writable } = new FixedLengthStream(zipLength(entries));
  await Promise.all([
    env.MEDIA.put(input.key, readable, { httpMetadata: { contentType: 'application/zip' } }),
    writeZip(writable, entries, input.at),
  ]);
}
