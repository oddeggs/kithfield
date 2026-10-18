import { createMiddleware } from 'hono/factory';

import type { AdminEnv } from './env';

/**
 * Anything that changes something (a form, or a write passed through to the admin API) must come
 * from the desk's own pages: the browser says so with `Sec-Fetch-Site: same-origin`, or with an
 * `Origin` equal to this host. A request with neither is refused, so another site can never post
 * with the moderator's Access cookie.
 */
export const sameOriginWrites = createMiddleware<AdminEnv>(async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD') {
    await next();
    return undefined;
  }
  const site = c.req.header('sec-fetch-site');
  const origin = c.req.header('origin');
  const ours =
    site === 'same-origin' || (origin !== undefined && origin === new URL(c.req.url).origin);
  if (!ours) return c.text('Forbidden', 403);
  await next();
  return undefined;
});
