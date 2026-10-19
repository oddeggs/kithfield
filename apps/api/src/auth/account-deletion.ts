import {
  type DeleteAccountResponse,
  DeletionConfirmRequest,
  DeletionRequest,
  type Lang,
} from '@kithfield/contracts';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { z } from 'zod';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { clientKey } from '../web/waitlist-store';
import {
  addressHash,
  clearCodeFailures,
  CODE_FAILURE_WINDOW_MS,
  CODE_SENDER,
  isAddressLocked,
  mayGetAnotherCode,
  recordSend,
} from './email-code';
import { authSecret } from './instance';
import { deletionLetter, sendScheduledLetter } from './deletion-letters';
import { DELETION_GRACE_MS } from './me';
import { errorResponse, requireSession, type SessionEnv } from './session';

/*
 * Asking for an account to be deleted (`docs/backend.md` §7). In the app, `POST /v1/me/delete`;
 * from the website, `POST /v1/deletion-requests` sends a 6-digit code to an address that signs in
 * to an account and `POST /v1/deletion-requests/confirm` takes it. Either way the person is marked
 * (`deleted_at`), every session and device key ends and every socket closes; 30 days later the
 * daily purge (`purge.ts`) deletes them, unless signing in has cancelled it.
 */

export const DELETION_CODE_LIFETIME_MS = 10 * 60_000;
export const DELETION_CODE_TRIES = 5;

/** Closes a person's sockets somewhere (their farms); registered by the parts that hold them. */
export type SocketCloser = (env: Bindings, person: string) => Promise<void>;

const closers = new Set<SocketCloser>();

/** Adds a socket closer; the returned function removes it again. */
export function registerSocketCloser(closer: SocketCloser): () => void {
  closers.add(closer);
  return () => {
    closers.delete(closer);
  };
}

/** Runs one step after the deletion committed; a failure is logged, never undoes the deletion. */
async function quietly(what: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`account deletion: ${what} failed`, {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Starts the 30-day wait: marks the person (keeping the first time if they asked before), ends
 * every session and device key, then closes their cottage and farm sockets and forgets their
 * devices' push tokens, and writes to say when the account goes. Null when the person is gone.
 */
export async function startDeletion(
  env: Bindings,
  person: string,
  now: number,
): Promise<DeleteAccountResponse | null> {
  const db = env.DB;
  const [marked] = await db.batch<{ deleted_at: number }>([
    db
      .prepare(
        'UPDATE people SET deleted_at = coalesce(deleted_at, ?2) WHERE id = ?1 RETURNING deleted_at',
      )
      .bind(person, now),
    db.prepare('DELETE FROM sessions WHERE person_id = ?').bind(person),
    db.prepare('DELETE FROM device_action_keys WHERE person_id = ?').bind(person),
    db.prepare('DELETE FROM deletion_codes WHERE person_id = ?').bind(person),
  ]);
  const deletedAt = marked?.results[0]?.deleted_at;
  if (deletedAt === undefined) return null;
  const cottage = cottageOf(env, person);
  await quietly('cottage sockets', () => cottage.closeSockets('unauthorized'));
  await quietly('devices', async () => {
    for (const { device } of await cottage.listDevices()) await cottage.forgetDevice(device);
  });
  for (const close of closers) await quietly('farm sockets', () => close(env, person));
  const purgeAt = deletedAt + DELETION_GRACE_MS;
  // Only when this request scheduled it: asking again writes no second letter.
  if (deletedAt === now) await quietly('letter', () => sendScheduledLetter(env, person, purgeAt));
  return { purgeAt };
}

/* Codes for the website's request. */

async function codeHash(secret: string, address: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`deletion:${await addressHash(address)}:${code}`),
  );
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Six random digits, every value equally likely. */
export function newDeletionCode(): string {
  const limit = 4_294_000_000; // the largest multiple of 1e6 below 2^32
  for (;;) {
    const [n = limit] = crypto.getRandomValues(new Uint32Array(1));
    if (n < limit) return String(n % 1_000_000).padStart(6, '0');
  }
}

/**
 * Sends a code when the address signs in to an account, within the address's limit on codes; a
 * new code replaces the last. Nothing happens for any other address.
 */
export async function sendDeletionCode(
  env: Bindings,
  input: { email: string; lang: Lang; now: number },
): Promise<void> {
  const db = env.DB;
  const address = input.email.trim().toLowerCase();
  const person = await db
    .prepare('SELECT id FROM people WHERE email = ? AND coalesce(is_anonymous, 0) = 0')
    .bind(address)
    .first<{ id: string }>();
  if (person === null || (await isAddressLocked(db, address, input.now))) return;
  if (!(await mayGetAnotherCode(db, address, input.now))) return;
  const code = newDeletionCode();
  const hash = await addressHash(address);
  await db
    .prepare(
      `INSERT OR REPLACE INTO deletion_codes (address_hash, person_id, code_hash, expires_at, tries_left)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      hash,
      person.id,
      await codeHash(authSecret(env), address, code),
      input.now + DELETION_CODE_LIFETIME_MS,
      DELETION_CODE_TRIES,
    )
    .run();
  const { subject, text } = deletionLetter(input.lang, code);
  try {
    await env.EMAIL.send({ from: CODE_SENDER, to: address, subject, text });
    await recordSend(db, address, input.now);
  } catch (error) {
    // A code that never left can't be entered: forget it.
    console.error('deletion code letter not sent', { error });
    await db.prepare('DELETE FROM deletion_codes WHERE address_hash = ?').bind(hash).run();
  }
}

/** Whether two hex digests match, in time that doesn't depend on where they differ. */
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The person a right code is for, spending it; null for a wrong, expired or used one, or any code
 * at all while the address is locked. Each try is spent before the code is compared, so guesses
 * sent at once can't outrun the five tries. A wrong code counts against the address's daily lock
 * (shared with sign-in codes) only while a code is waiting, so strangers can't lock an address; a
 * right one clears it. The same statements run whether or not a code is waiting.
 */
export async function takeDeletionCode(
  env: Bindings,
  input: { email: string; code: string; now: number },
): Promise<string | null> {
  const db = env.DB;
  const address = input.email.trim().toLowerCase();
  const hash = await addressHash(address);
  const tried = await codeHash(authSecret(env), address, input.code);
  if (await isAddressLocked(db, address, input.now)) return null;
  const spent = await db
    .prepare(
      `UPDATE deletion_codes SET tries_left = tries_left - 1
       WHERE address_hash = ? AND tries_left > 0 AND expires_at > ?
       RETURNING code_hash, person_id`,
    )
    .bind(hash, input.now)
    .first<{ code_hash: string; person_id: string }>();
  const right = spent !== null && sameDigest(tried, spent.code_hash);
  const [, , taken] = await db.batch<{ person_id: string }>([
    db
      .prepare('DELETE FROM email_code_failures WHERE address_hash = ? AND failed_at <= ?')
      .bind(hash, input.now - CODE_FAILURE_WINDOW_MS),
    db
      .prepare(
        'INSERT INTO email_code_failures (address_hash, failed_at) SELECT ?1, ?2 WHERE ?3 = 1',
      )
      .bind(hash, input.now, spent !== null && !right ? 1 : 0),
    // Spent once: of two requests with the same right code, only one takes it.
    db
      .prepare(
        'DELETE FROM deletion_codes WHERE address_hash = ? AND (code_hash = ? OR tries_left <= 0) RETURNING person_id, code_hash',
      )
      .bind(hash, right ? tried : ''),
  ]);
  const person = right ? (taken?.results[0]?.person_id ?? null) : null;
  if (person !== null) await clearCodeFailures(db, address);
  return person;
}

/* Routes. */

async function parse<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<{ ok: true; value: z.infer<S> } | { ok: false; response: Response }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 50);
  return { ok: false, response: errorResponse(c, 400, 'bad_request', fields) };
}

export function accountDeletionRoutes(): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.post('/v1/me/delete', requireSession, async (c) => {
    const started = await startDeletion(c.env, c.var.person, Date.now());
    if (started === null) return errorResponse(c, 401, 'unauthorized');
    return c.json(started satisfies DeleteAccountResponse, 202);
  });

  const withinLimit = async (c: Context<SessionEnv>) => {
    // An IPv6 /64 is one household's, so it is counted as one address.
    const address = clientKey(c.req.header('cf-connecting-ip') ?? 'unknown');
    return (await c.env.DELETION_REQUEST_LIMIT.limit({ key: address })).success;
  };
  /** Codes are keyed under the auth secret; without it, the website's path is unavailable. */
  const configured = (c: Context<SessionEnv>) => (c.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32;

  // The answer is the same for every address, and the letter goes after it, so neither the answer
  // nor its timing says whether the address has an account.
  routes.post('/v1/deletion-requests', async (c) => {
    if (!configured(c)) return errorResponse(c, 503, 'unavailable');
    if (!(await withinLimit(c))) return errorResponse(c, 429, 'rate_limited');
    const body = await parse(c, DeletionRequest);
    if (!body.ok) return body.response;
    const { email, lang } = body.value;
    c.executionCtx.waitUntil(
      sendDeletionCode(c.env, { email, lang, now: Date.now() }).catch((error: unknown) => {
        console.error('deletion request failed', { error });
      }),
    );
    return c.body(null, 202);
  });

  routes.post('/v1/deletion-requests/confirm', async (c) => {
    if (!configured(c)) return errorResponse(c, 503, 'unavailable');
    if (!(await withinLimit(c))) return errorResponse(c, 429, 'rate_limited');
    const body = await parse(c, DeletionConfirmRequest);
    if (!body.ok) return body.response;
    const now = Date.now();
    const person = await takeDeletionCode(c.env, { ...body.value, now });
    const started = person === null ? null : await startDeletion(c.env, person, now);
    if (started === null) return errorResponse(c, 400, 'code_invalid');
    return c.json(started satisfies DeleteAccountResponse, 202);
  });

  return routes;
}
