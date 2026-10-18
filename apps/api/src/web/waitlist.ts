import { WaitlistRequest, type Lang } from '@kithfield/contracts';
import { t } from '@kithfield/i18n';
import { Hono } from 'hono';

import { errorResponse } from '../auth/session';
import type { AppEnv } from '../env';

/**
 * The website's launch list (`docs/backend.md` §4), double opt-in:
 *
 * - `POST /v1/waitlist {email, lang}` keeps the address under a keyed hash and sends one letter
 *   with a confirmation link. It answers 204 whether or not the address was already listed, so the
 *   answer never tells anyone who is on the list.
 * - `GET /v1/waitlist/confirm/:token` (the letter's link) confirms the address and sends the
 *   browser on to the thank-you page.
 */

export const WAITLIST_SENDER = 'hello@kithfield.com';
/** An address nobody confirms is forgotten after a week. */
export const UNCONFIRMED_KEEP_MS = 7 * 24 * 60 * 60_000;
/** Asking again within this window sends no second letter. */
export const LETTER_AGAIN_AFTER_MS = 10 * 60_000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The list's key for an address: HMAC-SHA256 under the secret, of the trimmed, lowercased address. */
export async function waitlistEmailHash(secret: string, email: string): Promise<string> {
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
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return hex(mac);
}

async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function confirmationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function waitlistLetter(lang: Lang, link: string): { subject: string; text: string } {
  return {
    subject: t(lang, 'websitePages.letter.subject'),
    text: [
      t(lang, 'websitePages.letter.greeting'),
      '',
      t(lang, 'websitePages.letter.ask'),
      link,
      '',
      t(lang, 'websitePages.letter.once'),
      t(lang, 'websitePages.letter.notYou'),
      '',
      t(lang, 'websitePages.letter.signOff'),
    ].join('\n'),
  };
}

/** The thank-you page in the address's language. */
function thanksPath(lang: Lang): string {
  return `${lang === 'vi' ? '/vi' : ''}/waitlist/thanks`;
}

export function waitlistRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/v1/waitlist', async (c) => {
    const secret = c.env.WAITLIST_EMAIL_KEY;
    if (!secret) return errorResponse(c, 503, 'unavailable');
    const address = c.req.header('cf-connecting-ip') ?? 'unknown';
    const { success } = await c.env.WAITLIST_LIMIT.limit({ key: address });
    if (!success) return errorResponse(c, 429, 'rate_limited');

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return errorResponse(c, 400, 'bad_request');
    }
    const parsed = WaitlistRequest.safeParse(raw);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 50);
      return errorResponse(c, 400, 'bad_request', fields);
    }
    const email = parsed.data.email.trim().toLowerCase();
    const { lang } = parsed.data;
    const now = Date.now();
    const db = c.env.DB;
    const emailHash = await waitlistEmailHash(secret, email);

    const [, existing] = await db.batch<{ created_at: number; confirmed_at: number | null }>([
      db
        .prepare('DELETE FROM waitlist WHERE confirmed_at IS NULL AND created_at <= ?')
        .bind(now - UNCONFIRMED_KEEP_MS),
      db
        .prepare('SELECT created_at, confirmed_at FROM waitlist WHERE email_hash = ?')
        .bind(emailHash),
    ]);
    const row = existing?.results[0];
    // Already confirmed, or a letter went out a moment ago: nothing more to send.
    if (row && (row.confirmed_at !== null || row.created_at > now - LETTER_AGAIN_AFTER_MS)) {
      return c.body(null, 204);
    }

    const token = confirmationToken();
    const confirmHash = await sha256Hex(token);
    await db
      .prepare(
        `INSERT INTO waitlist (email_hash, email, lang, created_at, confirm_hash)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (email_hash) DO UPDATE SET
           email = excluded.email, lang = excluded.lang, created_at = excluded.created_at,
           confirm_hash = excluded.confirm_hash
         WHERE waitlist.confirmed_at IS NULL`,
      )
      .bind(emailHash, email, lang, now, confirmHash)
      .run();

    const link = `${new URL(c.req.url).origin}/api/v1/waitlist/confirm/${token}`;
    const { subject, text } = waitlistLetter(lang, link);
    try {
      await c.env.EMAIL.send({ from: WAITLIST_SENDER, to: email, subject, text });
    } catch (error) {
      // A letter that never left can't be confirmed: forget the address rather than keep it.
      console.error('waitlist letter not sent', { error });
      await db
        .prepare('DELETE FROM waitlist WHERE confirm_hash = ? AND confirmed_at IS NULL')
        .bind(confirmHash)
        .run();
      return errorResponse(c, 503, 'unavailable');
    }
    return c.body(null, 204);
  });

  routes.get('/v1/waitlist/confirm/:token', async (c) => {
    const token = c.req.param('token');
    const now = Date.now();
    if (TOKEN_PATTERN.test(token)) {
      const confirmed = await c.env.DB.prepare(
        `UPDATE waitlist SET confirmed_at = ?1, confirm_hash = NULL
         WHERE confirm_hash = ?2 AND confirmed_at IS NULL AND created_at > ?3
         RETURNING lang`,
      )
        .bind(now, await sha256Hex(token), now - UNCONFIRMED_KEEP_MS)
        .first<{ lang: Lang }>();
      if (confirmed) return c.redirect(`${thanksPath(confirmed.lang)}?confirmed=1`, 303);
    }
    // Used, expired or never sent: ask again from the start.
    return c.redirect('/waitlist', 303);
  });

  return routes;
}
