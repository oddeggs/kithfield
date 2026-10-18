import { Hono } from 'hono';

import { forward } from './api';
import type { AdminEnv } from './env';
import { formRoutes } from './forms';
import { sameOriginWrites } from './guard';
import { pageRoutes } from './pages';

/*
 * The safety desk: server-rendered pages over the admin API, and `/admin/v1/*` passed through to
 * it. Static files (the art renderer, the serif face) are served before this Worker runs.
 */

const app = new Hono<AdminEnv>();

app.use('*', sameOriginWrites);

app.get('/health', (c) => c.json({ status: 'ok', environment: c.env.ENVIRONMENT }));

/** The admin API itself, for tools: the same Access token, passed along unchanged. */
app.all('/admin/v1/*', async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname.slice('/admin/v1'.length) + url.search;
  const method = c.req.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const contentType = c.req.header('content-type');
  const response = await forward(c, path, {
    method,
    ...(contentType === undefined ? {} : { headers: { 'content-type': contentType } }),
    ...(hasBody ? { body: await c.req.arrayBuffer() } : {}),
  });
  return new Response(response.body, response);
});

/** The quarter's audit log as CSV, straight from the API. */
app.get('/audit.csv', async (c) => {
  const quarter = c.req.query('quarter');
  const response = await forward(
    c,
    `/audit.csv${quarter === undefined ? '' : `?quarter=${encodeURIComponent(quarter)}`}`,
  );
  return new Response(response.body, response);
});

app.route('/', formRoutes());
app.route('/', pageRoutes());

app.notFound((c) => c.redirect('/queue'));

export default app;
