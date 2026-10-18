import {
  WaitlistConfirmRequest,
  WaitlistPickRequest,
  WaitlistRequest,
  type Lang,
  type WaitlistResponse,
} from '@kithfield/contracts';
import { t } from '@kithfield/i18n';
import { type Context, Hono } from 'hono';
import type { z } from 'zod';

import { errorResponse } from '../auth/session';
import type { AppEnv } from '../env';
import { bindPick, confirmWithPick, mintPick, savePick } from './waitlist-picks';
import {
  TOKEN_PATTERN,
  clientKey,
  confirmationToken,
  sha256Hex,
  waitlistEmailHash,
} from './waitlist-store';

/**
 * The website's launch list (`docs/backend.md` §4), double opt-in:
 *
 * - `POST /v1/waitlist {email, lang, platform?}` keeps the address under a keyed hash and sends one
 *   letter linking to the site's confirm page. It answers 200 with a fresh `pick` token at once
 *   whether or not the address was already listed, and the letter goes after the answer, so neither
 *   the answer nor its timing tells anyone who is on the list.
 * - `PUT /v1/waitlist/pick {pick, species}` saves a critter early: 204, or 410 for a pick that is
 *   unknown or over a week old. It counts only once the address confirms (`waitlist-picks.ts`).
 * - `POST /v1/waitlist/confirm {token}` (from the confirm page) confirms the address and takes the
 *   pick bound to that letter: 204, or 410 when the link is used, expired or unknown.
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

/** The JSON body checked against a schema, or the 400 to answer with. */
async function parseBody<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<{ ok: true; value: z.infer<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: errorResponse(c, 400, 'bad_request') };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 50);
  return { ok: false, response: errorResponse(c, 400, 'bad_request', fields) };
}

export function waitlistRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/v1/waitlist', async (c) => {
    const secret = c.env.WAITLIST_EMAIL_KEY;
    if (!secret) return errorResponse(c, 503, 'unavailable');
    const address = clientKey(c.req.header('cf-connecting-ip') ?? 'unknown');
    const { success } = await c.env.WAITLIST_LIMIT.limit({ key: address });
    if (!success) return errorResponse(c, 429, 'rate_limited');

    const parsed = await parseBody(c, WaitlistRequest);
    if (!parsed.ok) return parsed.response;
    const email = parsed.value.email.trim().toLowerCase();
    const { lang } = parsed.value;
    const platform = parsed.value.platform ?? null;
    const now = Date.now();
    const db = c.env.DB;
    const emailHash = await waitlistEmailHash(secret, email);
    const site = c.env.SITE_ORIGIN;
    // Minted and kept before anything about the address is read, the same for everyone.
    const pick = await mintPick(db, emailHash, now);

    const send = async (): Promise<void> => {
      const row = await db
        .prepare('SELECT created_at, confirm_hash, confirmed_at FROM waitlist WHERE email_hash = ?')
        .bind(emailHash)
        .first<{ created_at: number; confirm_hash: string | null; confirmed_at: number | null }>();
      // Already confirmed: the pick stays unbound and the address hears nothing more.
      if (row?.confirmed_at != null) return;
      // A letter went out a moment ago: the pick joins its confirmation, and no second letter.
      if (row && row.created_at > now - LETTER_AGAIN_AFTER_MS) {
        if (row.confirm_hash !== null) await bindPick(db, pick, row.confirm_hash);
        return;
      }

      const token = confirmationToken();
      const confirmHash = await sha256Hex(token);
      await db
        .prepare(
          `INSERT INTO waitlist (email_hash, email, lang, created_at, confirm_hash, platform)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT (email_hash) DO UPDATE SET
             email = excluded.email, lang = excluded.lang, created_at = excluded.created_at,
             confirm_hash = excluded.confirm_hash,
             platform = coalesce(excluded.platform, waitlist.platform)
           WHERE waitlist.confirmed_at IS NULL`,
        )
        .bind(emailHash, email, lang, now, confirmHash, platform)
        .run();
      await bindPick(db, pick, confirmHash);
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
    return c.json({ pick } satisfies WaitlistResponse);
  });

  routes.put('/v1/waitlist/pick', async (c) => {
    const parsed = await parseBody(c, WaitlistPickRequest);
    if (!parsed.ok) return parsed.response;
    const { pick, species } = parsed.value;
    const saved = await savePick(c.env.DB, { pick, species, now: Date.now() });
    return saved ? c.body(null, 204) : errorResponse(c, 410, 'not_found');
  });

  routes.post('/v1/waitlist/confirm', async (c) => {
    const parsed = await parseBody(c, WaitlistConfirmRequest);
    if (!parsed.ok) return parsed.response;
    const confirmed = await confirmWithPick(c.env.DB, {
      confirmHash: await sha256Hex(parsed.value.token),
      now: Date.now(),
    });
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
