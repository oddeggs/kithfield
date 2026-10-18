import type { ErrorCode } from '@kithfield/contracts';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '../env';
import { AuthNotConfigured, authFor } from './instance';

/** Routes behind `requireSession` read the signed-in person's id as `c.var.person`. */
export type SessionEnv = AppEnv & { Variables: { person: string } };

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
 * session cookie. Answers 401 `unauthorized` without one, and sets `person` for the route.
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
  c.set('person', session.user.id);
  await next();
});
