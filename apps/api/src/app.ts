import { Hono } from 'hono';

import type { AppEnv } from './env';
import { farmApi } from './farm/routes';

/** The API. The Worker owns `<host>/api/*`; the website serves everything else on the host. */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

  app.get('/health', (c) =>
    c.json({ status: 'ok', environment: c.env.ENVIRONMENT, commit: c.env.COMMIT_SHA }),
  );
  app.route('/v1', farmApi());

  app.notFound((c) => c.json({ error: { code: 'not_found' } }, 404));

  app.onError((error, c) => {
    // The path and the error only: never a body, a header or a query string.
    console.error('unhandled error', { path: c.req.path, error });
    return c.json({ error: { code: 'internal' } }, 500);
  });

  return app;
}
