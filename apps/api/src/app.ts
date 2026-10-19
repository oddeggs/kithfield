import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';

import { adminRoutes, safetyRoutes } from './admin/routes';
import { voiceCaptionRoutes } from './ai';
import { authRoutes } from './auth';
import { callsRoutes } from './calls/routes';
import { exportRoutes } from './auth/export-routes';
import { cottageRoutes } from './cottage/routes';
import type { AppEnv } from './env';
import { farmApi } from './farm/routes';
import { mediaRoutes } from './media';
import { purchasesRoutes } from './purchases';
import { rhythmRoutes } from './rhythm/routes';
import { stickersRoutes } from './stickers/routes';
import { waitlistRoutes } from './web/waitlist';

/** The largest body any route reads whole; the biggest real one (a gift's or a plan's) is a few KB. */
export const BODY_LIMIT_BYTES = 256 * 1024;

/** Routes that check their own length before reading: the dev upload proxy and caption audio. */
const ownLimit = (path: string) =>
  path.startsWith('/api/v1/media/upload-proxy/') ||
  /^\/api\/v1\/farms\/[^/]+\/fire\/captions$/.test(path);

/** The API. The Worker owns `<host>/api/*`; the website serves everything else on the host. */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

  // Bodies are read whole before a schema looks at them, so none may be larger than this.
  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json({ error: { code: 'too_large' } }, 413),
  });
  app.use(
    '*',
    createMiddleware<AppEnv>((c, next) => (ownLimit(c.req.path) ? next() : limitBody(c, next))),
  );

  app.get('/health', (c) =>
    c.json({ status: 'ok', environment: c.env.ENVIRONMENT, commit: c.env.COMMIT_SHA }),
  );
  app.route('/', authRoutes());
  app.route('/', exportRoutes());

  app.route('/', cottageRoutes());
  app.route('/', waitlistRoutes());
  app.route('/', safetyRoutes());
  // The safety desk's API, behind Cloudflare Access; the admin Worker proxies to it.
  app.route('/admin/v1', adminRoutes());

  app.route('/v1', farmApi());
  app.route('/v1', mediaRoutes());
  app.route('/v1', rhythmRoutes());
  app.route('/v1', voiceCaptionRoutes());
  app.route('/v1', purchasesRoutes());
  app.route('/v1', callsRoutes());
  app.route('/v1', stickersRoutes());

  app.notFound((c) => c.json({ error: { code: 'not_found' } }, 404));

  app.onError((error, c) => {
    // The path and the error only: never a body, a header or a query string.
    console.error('unhandled error', { path: c.req.path, error });
    return c.json({ error: { code: 'internal' } }, 500);
  });

  return app;
}
