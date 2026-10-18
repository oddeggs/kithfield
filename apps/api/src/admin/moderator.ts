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
  email: string;
  name: string;
  role: string;
}

/** Records a moderator the first time Access lets them in; their role follows the config. */
export async function recordModerator(
  db: D1Database,
  email: string,
  role: ModeratorRole,
  now: number,
): Promise<Moderator> {
  const known = await db
    .prepare('SELECT id, email, name, role FROM moderators WHERE email = ?')
    .bind(email)
    .first<ModeratorRow>();
  if (known !== null) {
    await db
      .prepare('UPDATE moderators SET role = ?, last_seen_at = ? WHERE id = ?')
      .bind(role, now, known.id)
      .run();
    return { id: known.id, email, name: known.name, role };
  }
  const base = idFor(email);
  const taken = await db
    .prepare('SELECT COUNT(*) AS n FROM moderators WHERE id = ? OR id LIKE ?')
    .bind(base, `${base}-%`)
    .first<{ n: number }>();
  const id = (taken?.n ?? 0) === 0 ? base : `${base}-${(taken?.n ?? 0) + 1}`;
  const name = base;
  await db
    .prepare(
      `INSERT INTO moderators (id, email, name, role, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (email) DO NOTHING`,
    )
    .bind(id, email, name, role, now, now)
    .run();
  const row = await db
    .prepare('SELECT id, email, name, role FROM moderators WHERE email = ?')
    .bind(email)
    .first<ModeratorRow>();
  return { id: row?.id ?? id, email, name: row?.name ?? name, role };
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
