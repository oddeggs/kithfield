import type { FarmId, PersonId } from '@kithfield/contracts';
import { type Context, Hono, type Env } from 'hono';
import { z } from 'zod';

import type { Bindings } from '../env';
import { markQuarantined, mediaRow, setReport } from './index-store';
import { farmOfKey, keyOfMediaUrl, MEDIA_KEY } from './signature';

/*
 * Quarantine, for when Cloudflare's CSAM Scanning Tool flags a media URL (it blocks that URL and
 * emails the founder), or when a moderator finds such material. Quarantining:
 *
 * 1. marks the key quarantined in the media index, so `read-urls` stops signing it and the media
 *    Worker refuses it, cached copies included;
 * 2. moves the object out of the farm's prefix to `quarantine/<key>`, held as evidence for the
 *    legal reporting duty: unsend, account deletion and farm deletion never reach it there;
 * 3. opens an urgent report through the reports desk (the moderation console's `reports` table),
 *    through the seam below.
 *
 * Every step is safe to run again, so a retry finishes what a failure left.
 */

/** What the reports desk needs to open an urgent child-safety report for a quarantined object. */
export interface UrgentMediaReport {
  readonly farm: FarmId;
  readonly key: string;
  /** Who uploaded it, when the index knows. */
  readonly uploader: PersonId | null;
  /** `hash_match` for Cloudflare's scanning, `member` when a moderator found it. */
  readonly source: 'hash_match' | 'member';
  readonly note: string | null;
  readonly at: number;
}

/** Opens the report and answers its id. The moderation lane registers it. */
export type UrgentReportOpener = (env: Bindings, report: UrgentMediaReport) => Promise<string>;

let opener: UrgentReportOpener | null = null;

/** Registers the reports desk; the returned function removes it again. */
export function registerUrgentReportOpener(open: UrgentReportOpener): () => void {
  if (opener !== null) throw new Error('an urgent report opener is registered');
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/** Where quarantined evidence is held in the bucket. */
export const evidenceKey = (key: string) => `quarantine/${key}`;

export interface QuarantineInput {
  /** The media key, or the flagged URL from Cloudflare's notice. */
  readonly target: string;
  readonly source: UrgentMediaReport['source'];
  /** Who quarantined it: an admin id, or `csam-scan`. */
  readonly by: string;
  readonly note: string | null;
  readonly at: number;
}

export interface QuarantineResult {
  readonly key: string;
  readonly evidence: string;
  /** False when the key was already quarantined. */
  readonly first: boolean;
  /** Whether the evidence is held (the object existed, here or already moved). */
  readonly held: boolean;
  /** The urgent report, once the reports desk has opened it; null while none is registered. */
  readonly report: string | null;
}

/** Moves the object to the evidence prefix; true when the evidence is there now. */
async function holdEvidence(bucket: R2Bucket, key: string): Promise<boolean> {
  const evidence = evidenceKey(key);
  const object = await bucket.get(key);
  if (object === null) return (await bucket.head(evidence)) !== null;
  await bucket.put(evidence, object.body, {
    httpMetadata: object.httpMetadata ?? {},
    customMetadata: { from: key },
  });
  await bucket.delete(key);
  return true;
}

/** Quarantines one media object. Throws on a target that names no media key. */
export async function quarantineMedia(
  env: Bindings,
  input: QuarantineInput,
): Promise<QuarantineResult> {
  const key = MEDIA_KEY.test(input.target) ? input.target : keyOfMediaUrl(input.target);
  const farm = key === null ? null : farmOfKey(key);
  if (key === null || farm === null) throw new RangeError('not a media key or URL');

  const first = await markQuarantined(env.DB, {
    key,
    farm,
    by: input.by,
    note: input.note,
    at: input.at,
  });
  const held = await holdEvidence(env.MEDIA, key);

  const row = await mediaRow(env.DB, key);
  let report = row?.report_id ?? null;
  if (report === null && opener !== null) {
    report = await opener(env, {
      farm,
      key,
      uploader: row?.person_id ?? null,
      source: input.source,
      note: input.note,
      at: input.at,
    });
    await setReport(env.DB, key, report);
  }
  if (report === null) console.error('quarantined media has no urgent report yet', { farm });
  return { key, evidence: evidenceKey(key), first, held, report };
}

/** `POST …/media/quarantine`: a key or the flagged URL, and an optional note. */
export const QuarantineRequest = z
  .object({
    key: z.string().regex(MEDIA_KEY).optional(),
    url: z.url().max(2048).optional(),
    source: z.enum(['hash_match', 'member']).default('hash_match'),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .refine((r) => (r.key === undefined) !== (r.url === undefined), {
    message: 'a key or a url, not both',
  });

/**
 * The admin route, for the moderation console's API to mount behind its own guard (Cloudflare
 * Access): `who(c)` names the admin acting. Answers the `QuarantineResult`.
 */
export function mediaAdminRoutes<E extends Env & { Bindings: Bindings }>(
  who: (c: Context<E>) => string,
): Hono<E> {
  const app = new Hono<E>();
  app.post('/media/quarantine', async (c) => {
    const parsed = QuarantineRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: { code: 'bad_request' } }, 400);
    const { key, url, source, note } = parsed.data;
    const target = key ?? url ?? '';
    // A URL that names no media key (the schema has checked a bare key already).
    if (key === undefined && keyOfMediaUrl(target) === null) {
      return c.json({ error: { code: 'bad_request' } }, 400);
    }
    const result = await quarantineMedia(c.env, {
      target,
      source,
      by: who(c),
      note: note ?? null,
      at: Date.now(),
    });
    return c.json(result);
  });
  return app;
}
