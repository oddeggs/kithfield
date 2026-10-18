import { Hono } from 'hono';

import { adminRoutes, safetyRoutes } from './admin/routes';
import { voiceCaptionRoutes } from './ai';
import { authRoutes } from './auth';
import { exportRoutes } from './auth/export-routes';
import { cottageRoutes } from './cottage/routes';
import type { AppEnv } from './env';
import { farmApi } from './farm/routes';
import { mediaRoutes } from './media';
import { rhythmRoutes } from './rhythm/routes';
import { waitlistRoutes } from './web/waitlist';

/** The API. The Worker owns `<host>/api/*`; the website serves everything else on the host. */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

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

  app.notFound((c) => c.json({ error: { code: 'not_found' } }, 404));

  app.onError((error, c) => {
    // The path and the error only: never a body, a header or a query string.
    console.error('unhandled error', { path: c.req.path, error });
    return c.json({ error: { code: 'internal' } }, 500);
  });

  return app;
}
