import type { ExportStatus } from '@kithfield/contracts';
import { Hono } from 'hono';

import { isLive, latestExport, linkHolds, linkSecret, startExport, statusOf } from './export';
import { errorResponse, requireSession, type SessionEnv } from './session';

/**
 * The keepsakes export:
 * - `POST /v1/me/export`: starts it, or hands back the one preparing or ready. 202 `ExportStatus`.
 * - `GET /v1/me/export`: its state, with a signed link while ready. 200, or 404 when there is none.
 * - `GET /v1/me/export/:id/download?exp=&sig=`: the zip, for anyone holding a link that still
 *   holds (15 minutes); 404 otherwise. No session: the signature is the permission, so the link
 *   opens in a browser or a share sheet.
 * Until `EXPORT_URL_KEY` is set (at least 32 characters), all three answer 503 `unavailable`.
 */
export function exportRoutes(): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.post('/v1/me/export', requireSession, async (c) => {
    const secret = linkSecret(c.env);
    if (!secret) return errorResponse(c, 503, 'unavailable');
    const now = Date.now();
    const latest = await latestExport(c.env.DB, c.var.person);
    const row = latest !== null && isLive(latest, now) ? latest : null;
    const status = await statusOf(
      c.env,
      secret,
      row ?? (await startExport(c.env, c.var.person, now)),
      now,
    );
    return c.json(status satisfies ExportStatus, 202);
  });

  routes.get('/v1/me/export', requireSession, async (c) => {
    const secret = linkSecret(c.env);
    if (!secret) return errorResponse(c, 503, 'unavailable');
    const row = await latestExport(c.env.DB, c.var.person);
    if (row === null) return errorResponse(c, 404, 'not_found');
    return c.json((await statusOf(c.env, secret, row, Date.now())) satisfies ExportStatus);
  });

  routes.get('/v1/me/export/:id/download', async (c) => {
    const secret = linkSecret(c.env);
    if (!secret) return errorResponse(c, 503, 'unavailable');
    const id = c.req.param('id');
    const exp = Number(c.req.query('exp'));
    const sig = c.req.query('sig') ?? '';
    const now = Date.now();
    if (!Number.isSafeInteger(exp) || exp <= now) return errorResponse(c, 404, 'not_found');
    if (!(await linkHolds(secret, { id, exp, sig }))) return errorResponse(c, 404, 'not_found');
    const row = await c.env.DB.prepare(
      "SELECT r2_key FROM exports WHERE id = ? AND state = 'ready' AND expires_at > ?",
    )
      .bind(id, now)
      .first<{ r2_key: string }>();
    const object = row === null ? null : await c.env.MEDIA.get(row.r2_key);
    if (object === null) return errorResponse(c, 404, 'not_found');
    return new Response(object.body, {
      headers: {
        'content-type': 'application/zip',
        'content-length': String(object.size),
        'content-disposition': 'attachment; filename="kithfield-keepsakes.zip"',
        'cache-control': 'private, no-store',
      },
    });
  });

  return routes;
}
