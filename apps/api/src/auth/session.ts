import type { ErrorCode } from '@kithfield/contracts';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '../env';
import { isBanned } from './bans';
import { AuthNotConfigured, authFor } from './instance';

/**
 * Routes behind `requireSession` read the signed-in person's id as `c.var.person`, and the
 * session's own id as `c.var.session`.
 */
export type SessionEnv = AppEnv & { Variables: { person: string; session: string } };

/** A non-2xx answer in the contracts' `ErrorBody` shape. */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  fields?: string[],
): Response {
  return c.json({ error: { code, ...(fields ? { fields } : {}) } }, status);
}

/**
 * Requires a session: the app's bearer token (`Authorization: Bearer …`), or Better Auth's
 * session cookie. Answers 401 `unauthorized` without one and 403 `banned` for a banned person, and
 * sets `person` for the route.
 */
export const requireSession = createMiddleware<SessionEnv>(async (c, next) => {
  let session;
  try {
    session = await authFor(c.env).api.getSession({ headers: c.req.raw.headers });
  } catch (error) {
    if (error instanceof AuthNotConfigured) return errorResponse(c, 503, 'unavailable');
    throw error;
  }
  if (!session) return errorResponse(c, 401, 'unauthorized');
  if (await isBanned(c.env.DB, session.user.id, Date.now())) {
    return errorResponse(c, 403, 'banned');
  }
  c.set('person', session.user.id);
  c.set('session', session.session.id);
  await next();
});

/**
 * After `requireSession`, for writes that put a person among others: answers 403 `forbidden`
 * until they have passed the age check (`POST /v1/me/age`).
 */
export const requireAgeCheck = createMiddleware<SessionEnv>(async (c, next) => {
  const row = await c.env.DB.prepare('SELECT age_ok FROM people WHERE id = ?')
    .bind(c.var.person)
    .first<{ age_ok: number | null }>();
  if (row?.age_ok !== 1) return errorResponse(c, 403, 'forbidden');
  await next();
});
