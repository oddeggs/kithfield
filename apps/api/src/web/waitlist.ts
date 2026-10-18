import { WaitlistRequest, type Lang } from '@kithfield/contracts';
import { t } from '@kithfield/i18n';
import { Hono } from 'hono';

import { errorResponse } from '../auth/session';
import type { AppEnv } from '../env';
import {
  TOKEN_PATTERN,
  UNCONFIRMED_KEEP_MS,
  clientKey,
  confirmationToken,
  sha256Hex,
  waitlistEmailHash,
} from './waitlist-store';

/**
 * The website's launch list (`docs/backend.md` §4), double opt-in:
 *
 * - `POST /v1/waitlist {email, lang}` keeps the address under a keyed hash and sends one letter
 *   linking to the site's confirm page. It answers 204 at once whether or not the address was
 *   already listed, and the letter goes after the answer, so neither the answer nor its timing
 *   tells anyone who is on the list.
 * - `POST /v1/waitlist/confirm {token}` (from the confirm page) confirms the address: 204, or 410
 *   when the link is used, expired or unknown.
 * - `GET /v1/waitlist/confirm/:token` changes nothing; it sends the browser to the confirm page.
 */

export const WAITLIST_SENDER = 'hello@kithfield.com';
/** Asking again within this window sends no second letter. */
export const LETTER_AGAIN_AFTER_MS = 10 * 60_000;

function langPrefix(lang: Lang): string {
  return lang === 'vi' ? '/vi' : '';
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

export function waitlistRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/v1/waitlist', async (c) => {
    const secret = c.env.WAITLIST_EMAIL_KEY;
    if (!secret) return errorResponse(c, 503, 'unavailable');
    const address = clientKey(c.req.header('cf-connecting-ip') ?? 'unknown');
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
    const site = c.env.SITE_ORIGIN;

    const send = async (): Promise<void> => {
      const row = await db
        .prepare('SELECT created_at, confirmed_at FROM waitlist WHERE email_hash = ?')
        .bind(emailHash)
        .first<{ created_at: number; confirmed_at: number | null }>();
      // Already confirmed, or a letter went out a moment ago: nothing more to send.
      if (row && (row.confirmed_at !== null || row.created_at > now - LETTER_AGAIN_AFTER_MS))
        return;

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
      const link = `${site}${langPrefix(lang)}/waitlist/confirm#${token}`;
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
      }
    };
    c.executionCtx.waitUntil(send());
    return c.body(null, 204);
  });

  routes.post('/v1/waitlist/confirm', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    const token = body?.token;
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return errorResponse(c, 400, 'bad_request', ['token']);
    }
    const now = Date.now();
    const confirmed = await c.env.DB.prepare(
      `UPDATE waitlist SET confirmed_at = ?1, confirm_hash = NULL
       WHERE confirm_hash = ?2 AND confirmed_at IS NULL AND created_at > ?3
       RETURNING lang`,
    )
      .bind(now, await sha256Hex(token), now - UNCONFIRMED_KEEP_MS)
      .first<{ lang: Lang }>();
    // Used, expired, replaced by a newer letter or never sent.
    if (!confirmed) return errorResponse(c, 410, 'not_found');
    return c.body(null, 204);
  });

  routes.get('/v1/waitlist/confirm/:token', (c) => {
    const token = c.req.param('token');
    const fragment = TOKEN_PATTERN.test(token) ? `#${token}` : '';
    return c.redirect(`/waitlist/confirm${fragment}`, 303);
  });

  return routes;
}
