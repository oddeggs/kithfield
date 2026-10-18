import { type ErrorCode, ModeratorRole } from '@kithfield/contracts';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '../env';
import { ACCESS_HEADER, verifyAccessJwt } from './access';

export interface Moderator {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: ModeratorRole;
}

/** Routes behind `requireModerator` read who is at the desk as `c.var.moderator`. */
export type ModeratorEnv = AppEnv & { Variables: { moderator: Moderator } };

export type ModCtx = Context<ModeratorEnv>;

export const deny = (
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  fields?: string[],
) => c.json({ error: fields === undefined ? { code } : { code, fields } }, status);

/** The id a moderator is known by: their address's local part, readable in the log. */
const idFor = (email: string) =>
  (email.split('@')[0] ?? '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'moderator';

interface ModeratorRow {
  id: string;
  name: string;
}

/** Moderators already recorded, by address: they are written once, on first sight. */
const seen = new Map<string, { id: string; name: string }>();

/** A short, stable suffix from an address, for when its name is already someone's id. */
async function suffixFor(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return [...new Uint8Array(digest).slice(0, 3)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Records a moderator the first time Access lets them in, and never writes again. Their id is
 * their address's name, or that name and a suffix from the address when it is taken. Their role
 * always follows the config.
 */
export async function recordModerator(
  db: D1Database,
  email: string,
  role: ModeratorRole,
  now: number,
): Promise<Moderator> {
  const cached = seen.get(email);
  if (cached !== undefined) return { ...cached, email, role };
  const known = await db
    .prepare('SELECT id, name FROM moderators WHERE email = ?')
    .bind(email)
    .first<{ id: string; name: string }>();
  if (known !== null) {
    seen.set(email, known);
    return { ...known, email, role };
  }
  const name = idFor(email);
  for (const id of [name, `${name}-${await suffixFor(email)}`]) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO moderators (id, email, name, role, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, email, name, role, now, now)
      .run();
    const row = await db
      .prepare('SELECT id, name FROM moderators WHERE email = ?')
      .bind(email)
      .first<{ id: string; name: string }>();
    if (row !== null) {
      seen.set(email, row);
      return { ...row, email, role };
    }
  }
  throw new Error('Could not record a moderator');
}

/** Everyone the desk has seen, by id, for names in the log and the queue. */
export async function moderatorNames(db: D1Database): Promise<Map<string, string>> {
  const { results } = await db.prepare('SELECT id, name FROM moderators').all<ModeratorRow>();
  return new Map(results.map((r) => [r.id, r.name]));
}

/** The role the `MODERATORS` secret (JSON, address → role) gives an address, or null. */
export function roleOf(secret: string | undefined, email: string): ModeratorRole | null {
  let listed: unknown;
  try {
    listed = JSON.parse(secret ?? '{}');
  } catch {
    return null;
  }
  if (typeof listed !== 'object' || listed === null) return null;
  const entry = Object.entries(listed).find(([address]) => address.toLowerCase() === email);
  if (entry === undefined) return null;
  const role = ModeratorRole.safeParse(entry[1]);
  return role.success ? role.data : 'moderator';
}

/**
 * Only people Cloudflare Access let in, whose address the environment lists as a moderator.
 * 401 `unauthorized` without a valid Access token, 403 `forbidden` for anyone else.
 */
export const requireModerator = createMiddleware<ModeratorEnv>(async (c, next) => {
  const missing = (['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'MODERATORS'] as const).filter(
    (name) => (c.env[name] ?? '') === '',
  );
  if (missing.length > 0) {
    console.error('the safety desk is not configured', { missing });
    return deny(c, 503, 'unavailable');
  }
  let identity;
  try {
    identity = await verifyAccessJwt(c.req.header(ACCESS_HEADER), {
      teamDomain: c.env.ACCESS_TEAM_DOMAIN,
      audience: c.env.ACCESS_AUD,
    });
  } catch (error) {
    console.error('access certs unavailable', { error });
    return deny(c, 503, 'unavailable');
  }
  if (identity === null) return deny(c, 401, 'unauthorized');
  const role = roleOf(c.env.MODERATORS, identity.email);
  if (role === null) return deny(c, 403, 'forbidden');
  const moderator = await recordModerator(c.env.DB, identity.email, role, Date.now());
  c.set('moderator', moderator);
  await next();
  return undefined;
});
