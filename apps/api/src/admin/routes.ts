import {
  ActionRequest,
  AppealDecision,
  AppealRequest,
  AppealStatus,
  type ErrorCode,
  Id,
  type ModeratorSelf,
  QueueQuery,
  ReportRequest,
} from '@kithfield/contracts';
import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import { requireSession, type SessionEnv } from '../auth';
import { mediaAdminRoutes } from '../media/quarantine';
// The safety desk's steps in an account's purge and merge, and its reports for quarantined media.
import './media-reports';
import './people';
import { appealPage, decideAppeal, readAppeal, takeAppeal } from './appeals';
import { auditCsv, auditPage, quarterOf, quarterRange } from './audit';
import { approve, decide } from './decide';
import { claimReport, openReport, queuePage } from './desk';
import { takeReport } from './intake';
import { memberRecord } from './members';
import { deny, type ModeratorEnv, requireModerator } from './moderator';
import { readNotes } from './notes';
import { pendingActions } from './pending';
import { responseTimes } from './times';

/** A JSON body parsed against a contract; on failure, the 400 to send instead. */
async function parseBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<{ ok: true; value: z.infer<S> } | { ok: false; response: Response }> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = parsed.error.issues.map((i) => i.path.join('.')).slice(0, 50);
  return { ok: false, response: deny(c, 400, 'bad_request', fields) };
}

const failed = (c: Context, out: { status: ContentfulStatusCode; code: ErrorCode }) =>
  deny(c, out.status, out.code);

const idParam = (c: Context): string | null => {
  const parsed = Id.safeParse(c.req.param('id'));
  return parsed.success ? parsed.data : null;
};

/**
 * The app's side of safety, mounted at `/api`: reporting, the notes people hear back through,
 * and asking for another look.
 */
export function safetyRoutes(): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();

  const limited = async (c: Context<SessionEnv>, what: 'report' | 'appeal') =>
    !(await c.env.REPORT_LIMIT.limit({ key: `${what}:${c.get('person')}` })).success;

  app.post('/v1/reports', requireSession, async (c) => {
    const req = await parseBody(c, ReportRequest);
    if (!req.ok) return req.response;
    if (await limited(c, 'report')) return deny(c, 429, 'rate_limited');
    const out = await takeReport(c.env, c.get('person'), req.value, Date.now());
    if (!out.ok) return deny(c, out.status, out.code, out.fields);
    return c.json({ report: out.report }, 201);
  });

  app.get('/v1/me/safety-notes', requireSession, async (c) =>
    c.json(await readNotes(c.env, c.get('person'))),
  );

  app.post('/v1/appeals', requireSession, async (c) => {
    const req = await parseBody(c, AppealRequest);
    if (!req.ok) return req.response;
    if (await limited(c, 'appeal')) return deny(c, 429, 'rate_limited');
    const out = await takeAppeal(c.env, c.get('person'), req.value, Date.now());
    if (!out.ok) return failed(c, out);
    return c.json({ appeal: out.appeal }, 201);
  });

  return app;
}

const AuditQuery = z.object({
  before: z.coerce.number().int().min(0).optional(),
  cursor: z.string().max(256).optional(),
});
const AppealQuery = z.object({
  status: AppealStatus.optional(),
  cursor: z.string().max(256).optional(),
});
const ActionsQuery = z.object({
  status: z.literal('awaiting_second'),
  cursor: z.string().max(256).optional(),
});
const DaysQuery = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) });

/** The safety desk's API, mounted at `/api/admin/v1`, behind Cloudflare Access. */
export function adminRoutes(): Hono<ModeratorEnv> {
  const app = new Hono<ModeratorEnv>();
  app.use('*', requireModerator);
  // Writes are JSON only: a browser can't send that cross-site without asking first.
  app.use('*', async (c: Context<ModeratorEnv>, next) => {
    const method = c.req.method;
    const json = (c.req.header('content-type') ?? '').split(';')[0]?.trim() === 'application/json';
    if (method !== 'GET' && method !== 'HEAD' && !json) return deny(c, 415, 'bad_request');
    await next();
    return undefined;
  });

  // `POST /media/quarantine`: a moderator, or the founder from Cloudflare's notice, holds an
  // object as evidence; an urgent report opens.
  app.route(
    '/',
    mediaAdminRoutes<ModeratorEnv>((c) => c.get('moderator').id),
  );

  app.get('/me', (c) => {
    const me = c.get('moderator');
    return c.json({
      moderator: me.id,
      name: me.name.slice(0, 64),
      role: me.role,
      shiftEndsAt: null,
    } satisfies ModeratorSelf);
  });

  app.get('/queue', async (c) => {
    const query = QueueQuery.safeParse(c.req.query());
    if (!query.success) return deny(c, 400, 'bad_request', ['category']);
    return c.json(await queuePage(c.env.DB, query.data));
  });

  app.get('/reports/:id', async (c) => {
    const id = idParam(c);
    const detail = id === null ? null : await openReport(c.env, c.get('moderator'), id, Date.now());
    return detail === null ? deny(c, 404, 'not_found') : c.json(detail);
  });

  app.post('/reports/:id/claim', async (c) => {
    const id = idParam(c);
    const out =
      id === null ? 'missing' : await claimReport(c.env, c.get('moderator'), id, Date.now());
    if (out === 'missing') return deny(c, 404, 'not_found');
    return out === 'taken' ? deny(c, 409, 'conflict') : c.body(null, 204);
  });

  app.post('/reports/:id/actions', async (c) => {
    const id = idParam(c);
    if (id === null) return deny(c, 404, 'not_found');
    const req = await parseBody(c, ActionRequest);
    if (!req.ok) return req.response;
    const out = await decide(c.env, c.get('moderator'), id, req.value, Date.now());
    return out.ok ? c.json(out.response) : failed(c, out);
  });

  app.get('/actions', async (c) => {
    const query = ActionsQuery.safeParse(c.req.query());
    if (!query.success) return deny(c, 400, 'bad_request', ['status']);
    return c.json(await pendingActions(c.env.DB, query.data));
  });

  app.post('/actions/:id/approve', async (c) => {
    const id = idParam(c);
    if (id === null) return deny(c, 404, 'not_found');
    const out = await approve(c.env, c.get('moderator'), id, Date.now());
    return out.ok ? c.json(out.response) : failed(c, out);
  });

  app.get('/members/:id', async (c) => {
    const id = idParam(c);
    const record = id === null ? null : await memberRecord(c.env, id, Date.now());
    return record === null ? deny(c, 404, 'not_found') : c.json(record);
  });

  app.get('/appeals', async (c) => {
    const query = AppealQuery.safeParse(c.req.query());
    if (!query.success) return deny(c, 400, 'bad_request', ['status']);
    return c.json(await appealPage(c.env.DB, query.data));
  });

  app.get('/appeals/:id', async (c) => {
    const id = idParam(c);
    if (id === null) return deny(c, 404, 'not_found');
    const out = await readAppeal(c.env.DB, c.get('moderator'), id);
    return out.ok ? c.json(out.appeal) : failed(c, out);
  });

  app.post('/appeals/:id/decision', async (c) => {
    const id = idParam(c);
    if (id === null) return deny(c, 404, 'not_found');
    const req = await parseBody(c, AppealDecision);
    if (!req.ok) return req.response;
    const out = await decideAppeal(c.env, c.get('moderator'), id, req.value, Date.now());
    return out.ok ? c.body(null, 204) : failed(c, out);
  });

  app.get('/audit', async (c) => {
    const query = AuditQuery.safeParse(c.req.query());
    if (!query.success) return deny(c, 400, 'bad_request', ['before']);
    return c.json(await auditPage(c.env.DB, query.data));
  });

  app.get('/audit.csv', async (c) => {
    const quarter = c.req.query('quarter') ?? quarterOf(Date.now());
    const range = quarterRange(quarter);
    if (range === null) return deny(c, 400, 'bad_request', ['quarter']);
    return c.body(await auditCsv(c.env.DB, range), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="kithfield-audit-${quarter}.csv"`,
    });
  });

  app.get('/response-times', async (c) => {
    const query = DaysQuery.safeParse(c.req.query());
    if (!query.success) return deny(c, 400, 'bad_request', ['days']);
    return c.json(await responseTimes(c.env.DB, query.data.days, Date.now()));
  });

  return app;
}
