import {
  DesktopLinkRequest,
  type DesktopLinkPreview,
  type DesktopLinkResponse,
  type DesktopLinkSession,
  DesktopLinkSessionRequest,
  Platform,
} from '@kithfield/contracts';
import { type Context, Hono } from 'hono';

import { authFor } from './instance';
import { registerMergeStep } from './merge-steps';
import { errorResponse, requireSession, type SessionEnv } from './session';

/*
 * Signing in on a computer by QR (`docs/backend.md` §2). The computer, with no session, asks for a
 * code and keeps a secret; it shows the code as a QR, which lives 60 seconds (it asks again for a
 * fresh one). The signed-in phone scans it, sees the computer's name, platform and city, and
 * approves after Face ID, or declines. The computer asks with its secret until the phone answers,
 * and collects its own new session once. Codes and secrets are kept only as SHA-256 hashes, are
 * single-use, and asking for or answering codes is rate-limited.
 */

/** How long a code can be scanned and answered. */
export const DESKTOP_LINK_LIFETIME_MS = 60_000;
/** How long an approved code can still be collected. */
const COLLECT_WITHIN_MS = 5 * 60_000;
/** Rows kept this long after they expire, then dropped as new codes are made. */
const KEPT_MS = 24 * 60 * 60_000;

const encoder = new TextEncoder();

const randomToken = (bytes: number) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const CODE = /^[A-Za-z0-9_-]{16,128}$/;

type LinkRow = {
  secret_hash: string;
  name: string;
  platform: string;
  city: string | null;
  status: 'waiting' | 'approved' | 'declined' | 'collected';
  person_id: string | null;
  expires_at: number;
  answered_at: number | null;
};

async function linkOf(db: D1Database, code: string): Promise<(LinkRow & { hash: string }) | null> {
  if (!CODE.test(code)) return null;
  const hash = await sha256(code);
  const row = await db
    .prepare(
      `SELECT secret_hash, name, platform, city, status, person_id, expires_at, answered_at
       FROM desktop_links WHERE code_hash = ?`,
    )
    .bind(hash)
    .first<LinkRow>();
  return row === null ? null : { ...row, hash };
}

const limited = async (c: Context<SessionEnv>, key: string) =>
  !(await c.env.DESKTOP_LINK_LIMIT.limit({ key })).success;

/** The phone's answer: approve or decline a code still waiting. False when it can't be. */
async function answer(
  db: D1Database,
  code: string,
  person: string,
  status: 'approved' | 'declined',
  now: number,
): Promise<boolean> {
  if (!CODE.test(code)) return false;
  const result = await db
    .prepare(
      `UPDATE desktop_links SET status = ?, person_id = ?, answered_at = ?
       WHERE code_hash = ? AND status = 'waiting' AND expires_at > ?`,
    )
    .bind(status, person, now, await sha256(code), now)
    .run();
  return result.meta.changes === 1;
}

/**
 * The computer collects its session: once, with its secret, within five minutes of the approval.
 * The session is tied to a device named as the phone was shown it, so it is listed in
 * `GET /v1/devices` and can be signed out from there.
 */
async function collect(
  c: Context<SessionEnv>,
  link: LinkRow & { hash: string },
  now: number,
): Promise<DesktopLinkSession | null> {
  if (link.person_id === null || (link.answered_at ?? 0) + COLLECT_WITHIN_MS <= now) return null;
  const claimed = await c.env.DB.prepare(
    "UPDATE desktop_links SET status = 'collected' WHERE code_hash = ? AND status = 'approved'",
  )
    .bind(link.hash)
    .run();
  if (claimed.meta.changes !== 1) return null;
  const context = await authFor(c.env).$context;
  let session: { id: string; token: string };
  try {
    session = await context.internalAdapter.createSession(link.person_id);
  } catch {
    // Banned or being deleted since the phone approved: nothing to hand over.
    return null;
  }
  await c.env.DB.prepare(
    `INSERT INTO session_devices (session_id, person_id, device_id, name, platform, city, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(session.id, link.person_id, crypto.randomUUID(), link.name, link.platform, link.city, now)
    .run();
  return { status: 'approved', token: session.token, person: link.person_id };
}

/** An anonymous phone that approved a code, then merged, approved it as the kept person. */
registerMergeStep('desktop-links', (db, { from, into }) => [
  db.prepare('UPDATE desktop_links SET person_id = ? WHERE person_id = ?').bind(into, from),
]);

export function desktopLinkRoutes(): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  // The computer: no session yet.
  routes.post('/v1/desktop-link', async (c) => {
    if (await limited(c, `ask:${c.req.header('cf-connecting-ip') ?? 'unknown'}`)) {
      return errorResponse(c, 429, 'rate_limited');
    }
    const parsed = DesktopLinkRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return errorResponse(
        c,
        400,
        'bad_request',
        parsed.error.issues.map((i) => i.path.join('.')).slice(0, 50),
      );
    }
    const now = Date.now();
    const code = randomToken(24);
    const secret = randomToken(32);
    const expiresAt = now + DESKTOP_LINK_LIFETIME_MS;
    const city = (c.req.raw.cf as { city?: unknown } | undefined)?.city;
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM desktop_links WHERE expires_at < ?').bind(now - KEPT_MS),
      c.env.DB.prepare(
        `INSERT INTO desktop_links (code_hash, secret_hash, name, platform, city, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        await sha256(code),
        await sha256(secret),
        parsed.data.name,
        parsed.data.platform,
        typeof city === 'string' && city.trim() !== '' ? city.slice(0, 80) : null,
        now,
        expiresAt,
      ),
    ]);
    return c.json({ code, secret, expiresAt } satisfies DesktopLinkResponse);
  });

  // The computer asks whether the phone answered.
  routes.post('/v1/desktop-link/:code/session', async (c) => {
    const parsed = DesktopLinkSessionRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return errorResponse(c, 400, 'bad_request', ['secret']);
    const link = await linkOf(c.env.DB, c.req.param('code'));
    if (link === null || link.secret_hash !== (await sha256(parsed.data.secret))) {
      return errorResponse(c, 404, 'not_found');
    }
    const now = Date.now();
    if (link.status === 'waiting' && link.expires_at > now) {
      return c.json({ status: 'waiting', expiresAt: link.expires_at } satisfies DesktopLinkSession);
    }
    if (link.status === 'declined')
      return c.json({ status: 'declined' } satisfies DesktopLinkSession);
    const out = link.status === 'approved' ? await collect(c, link, now) : null;
    return out === null ? errorResponse(c, 404, 'not_found') : c.json(out);
  });

  // The phone: what is asking, before Face ID.
  routes.get('/v1/desktop-link/:code', requireSession, async (c) => {
    if (await limited(c, `phone:${c.var.person}`)) return errorResponse(c, 429, 'rate_limited');
    const link = await linkOf(c.env.DB, c.req.param('code'));
    const platform = Platform.safeParse(link?.platform);
    if (link === null || link.status !== 'waiting' || link.expires_at <= Date.now()) {
      return errorResponse(c, 404, 'not_found');
    }
    if (!platform.success) return errorResponse(c, 404, 'not_found');
    return c.json({
      name: link.name,
      platform: platform.data,
      city: link.city,
    } satisfies DesktopLinkPreview);
  });

  for (const [path, status] of [
    ['approve', 'approved'],
    ['decline', 'declined'],
  ] as const) {
    routes.post(`/v1/desktop-link/:code/${path}`, requireSession, async (c) => {
      if (await limited(c, `phone:${c.var.person}`)) return errorResponse(c, 429, 'rate_limited');
      const done = await answer(c.env.DB, c.req.param('code'), c.var.person, status, Date.now());
      return done ? c.body(null, 204) : errorResponse(c, 404, 'not_found');
    });
  }

  return routes;
}
