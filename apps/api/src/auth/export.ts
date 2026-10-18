import { EpochMs, type ExportStatus, PersonId } from '@kithfield/contracts';
import { z } from 'zod';

import { registerDeletionJob } from '../deletion';
import type { Bindings } from '../env';
import { writeBundle } from './export-bundle';

/*
 * The keepsakes export (`docs/backend.md` §7): `POST /v1/me/export` asks for it, a job on the
 * `deletion` queue builds the zip into R2 (`export-bundle.ts`), and `GET /v1/me/export` reads its
 * state with a short-lived signed download link. A bundle is kept 7 days; the daily job then
 * deletes it. Account deletion forgets them all (`forgetExports`).
 */

/** A ready bundle is kept this long. */
export const EXPORT_KEEP_MS = 7 * 24 * 60 * 60_000;
/** A download link works this long. */
export const EXPORT_LINK_MS = 15 * 60_000;
/** A request still preparing after this long is taken as lost, and a new one may start. */
export const PREPARING_GIVE_UP_MS = 24 * 60 * 60_000;

/** On the `deletion` queue: build this export's bundle. */
export const ExportJob = z.object({
  kind: z.literal('export'),
  person: PersonId,
  export: z.uuid(),
  at: EpochMs,
});
export type ExportJob = z.infer<typeof ExportJob>;

export interface ExportRow {
  id: string;
  person_id: string;
  state: 'preparing' | 'ready' | 'expired';
  requested_at: number;
  ready_at: number | null;
  expires_at: number | null;
  r2_key: string;
}

/** The person's latest export, or null. */
export const latestExport = (db: D1Database, person: string): Promise<ExportRow | null> =>
  db
    .prepare('SELECT * FROM exports WHERE person_id = ? ORDER BY requested_at DESC, rowid DESC')
    .bind(person)
    .first<ExportRow>();

/** A ready bundle past its 7 days reads as expired, even before the daily job deletes it. */
function stateOf(row: ExportRow, now: number): ExportStatus['state'] {
  if (row.state === 'ready' && row.expires_at !== null && row.expires_at <= now) return 'expired';
  return row.state;
}

/** Whether the row is an export still worth handing back instead of starting another. */
export function isLive(row: ExportRow, now: number): boolean {
  const state = stateOf(row, now);
  if (state === 'ready') return true;
  return state === 'preparing' && row.requested_at > now - PREPARING_GIVE_UP_MS;
}

/** Starts an export for the person and queues its job. */
export async function startExport(env: Bindings, person: string, now: number): Promise<ExportRow> {
  const id = crypto.randomUUID();
  const row: ExportRow = {
    id,
    person_id: person,
    state: 'preparing',
    requested_at: now,
    ready_at: null,
    expires_at: null,
    r2_key: `export/${person}/${id}.zip`,
  };
  await env.DB.prepare(
    'INSERT INTO exports (id, person_id, state, requested_at, r2_key) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(row.id, person, row.state, now, row.r2_key)
    .run();
  const job: ExportJob = { kind: 'export', person, export: id, at: now };
  await env.DELETION_QUEUE.send(job);
  return row;
}

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const linkKey = (secret: string, usage: KeyUsage) =>
  crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );

/** The download link's signature over the export id and the link's expiry. */
export async function signLink(secret: string, id: string, exp: number): Promise<string> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    await linkKey(secret, 'sign'),
    new TextEncoder().encode(`${id}.${exp}`),
  );
  return base64url(mac);
}

/** Whether a download link's signature holds, compared in constant time. */
export async function linkHolds(
  secret: string,
  input: { id: string; exp: number; sig: string },
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.sig)) return false;
  const padded = input.sig.replace(/-/g, '+').replace(/_/g, '/') + '=';
  const mac = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return crypto.subtle.verify(
    'HMAC',
    await linkKey(secret, 'verify'),
    mac,
    new TextEncoder().encode(`${input.id}.${input.exp}`),
  );
}

/** The row as the app reads it, with a fresh signed link while ready. */
export async function statusOf(
  env: Bindings,
  secret: string,
  row: ExportRow,
  now: number,
): Promise<ExportStatus> {
  const state = stateOf(row, now);
  let url: string | null = null;
  if (state === 'ready') {
    const exp = Math.min(now + EXPORT_LINK_MS, row.expires_at ?? now + EXPORT_LINK_MS);
    const sig = await signLink(secret, row.id, exp);
    url = `${env.SITE_ORIGIN}/api/v1/me/export/${row.id}/download?exp=${exp}&sig=${sig}`;
  }
  return { state, url, requestedAt: row.requested_at, expiresAt: row.expires_at };
}

/** The export job: builds the bundle and marks it ready. A rerun after success does nothing. */
export async function runExport(env: Bindings, job: ExportJob): Promise<void> {
  const row = await env.DB.prepare('SELECT * FROM exports WHERE id = ? AND person_id = ?')
    .bind(job.export, job.person)
    .first<ExportRow>();
  if (row?.state !== 'preparing') return;
  const now = Date.now();
  await writeBundle(env, { person: job.person, key: row.r2_key, at: now });
  await env.DB.prepare(
    `UPDATE exports SET state = 'ready', ready_at = ?, expires_at = ?
     WHERE id = ? AND state = 'preparing'`,
  )
    .bind(now, now + EXPORT_KEEP_MS, row.id)
    .run();
}

/** The daily job: deletes bundles past their 7 days and marks them expired. */
export async function expireExports(env: Bindings, now: number): Promise<number> {
  const { results } = await env.DB.prepare(
    "SELECT id, r2_key FROM exports WHERE state = 'ready' AND expires_at <= ?",
  )
    .bind(now)
    .all<{ id: string; r2_key: string }>();
  if (results.length === 0) return 0;
  await env.MEDIA.delete(results.map((r) => r.r2_key));
  await env.DB.batch(
    results.map((r) =>
      env.DB.prepare("UPDATE exports SET state = 'expired' WHERE id = ?").bind(r.id),
    ),
  );
  return results.length;
}

/** Account deletion: every bundle of the person's goes from R2, and their rows from D1. */
export async function forgetExports(env: Bindings, person: string): Promise<void> {
  const listed = await env.MEDIA.list({ prefix: `export/${person}/` });
  const keys = listed.objects.map((o) => o.key);
  const { results } = await env.DB.prepare('SELECT r2_key FROM exports WHERE person_id = ?')
    .bind(person)
    .all<{ r2_key: string }>();
  const all = [...new Set([...keys, ...results.map((r) => r.r2_key)])];
  for (let i = 0; i < all.length; i += 1000) await env.MEDIA.delete(all.slice(i, i + 1000));
  await env.DB.prepare('DELETE FROM exports WHERE person_id = ?').bind(person).run();
}

registerDeletionJob('export', ExportJob, runExport);
