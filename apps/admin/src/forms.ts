import {
  ActionRequest,
  ActionResponse,
  AppealDecision,
  Id,
  MediaQuarantineResponse,
  type ModerationAction,
  RuleRef,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import { send } from './api';
import { tr } from './copy';
import type { AdminEnv } from './env';
import { type Ctx, failure } from './render';

/*
 * The desk's forms. Each turns into one admin API call; the API checks the Access token, the
 * rules (a rule for every decision that needs one, a second moderator for a removal) and logs it.
 */

const idOf = (value: string | undefined): string | null => {
  const parsed = Id.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const formOf = async (c: Ctx): Promise<Record<string, string>> => {
  const body = await c.req.parseBody();
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) if (typeof value === 'string') out[key] = value;
  return out;
};

/** The decision a form names, as the API knows it. */
const ACTIONS: Readonly<Record<string, ModerationAction>> = {
  dismiss: 'dismiss',
  remove: 'remove',
  warn: 'remove_warn',
  pause: 'pause_7d',
  farm: 'remove_from_farm',
  ban: 'remove_from_kithfield',
};

function actionOf(form: Record<string, string>): ModerationAction | null {
  const picked = form['action'];
  if (picked === 'escalate')
    return form['escalate'] === 'legal' ? 'escalate_legal' : 'escalate_urgent';
  return picked === undefined ? null : (ACTIONS[picked] ?? null);
}

const RULE_FREE = new Set<ModerationAction>([
  'dismiss',
  'escalate_urgent',
  'escalate_legal',
  'unfreeze_farm',
]);

function ruleOf(raw: string | undefined): RuleRef | null {
  if (raw === undefined || raw === '') return null;
  const parsed = RuleRef.safeParse(/^\d+$/.test(raw) ? Number(raw) : raw);
  return parsed.success ? parsed.data : null;
}

/** Where to go after a decision: back to the page it came from, if it was one of ours. */
const backTo = (raw: string | undefined, fallback: string) =>
  raw !== undefined && /^\/(members|reports|queue)\/?[A-Za-z0-9_?=&/-]*$/.test(raw)
    ? raw
    : fallback;

export function formRoutes(): Hono<AdminEnv> {
  const app = new Hono<AdminEnv>();

  app.post('/reports/:id/decide', async (c) => {
    const id = idOf(c.req.param('id'));
    if (id === null) return c.redirect('/queue');
    const form = await formOf(c);
    const action = actionOf(form);
    const request = ActionRequest.safeParse({
      action,
      rule: action !== null && RULE_FREE.has(action) ? null : ruleOf(form['rule']),
      note: form['note'] ?? '',
      tellReporters: form['tellReporters'] === '1',
      tellMember: form['tellMember'] === '1',
    });
    if (!request.success) return failure(c, { ok: false, status: 400, code: 'bad_request' });
    const out = await send(c, `/reports/${id}/actions`, request.data, ActionResponse);
    if (!out.ok) return failure(c, out);
    if (out.data?.status === 'awaiting_second') {
      return c.redirect(`/actions/${out.data.action}?report=${id}`);
    }
    return c.redirect(backTo(form['back'], '/queue?done=1'));
  });

  app.post('/actions/:id/approve', async (c) => {
    const id = idOf(c.req.param('id'));
    if (id === null) return c.redirect('/queue');
    const out = await send(c, `/actions/${id}/approve`, undefined, ActionResponse);
    if (!out.ok) return failure(c, out);
    return c.redirect('/queue?done=1');
  });

  // Quarantine a photo from a report: the API holds it as evidence and opens an urgent report.
  app.post('/media/quarantine', async (c) => {
    const form = await formOf(c);
    const report = idOf(form['report']);
    const key = form['key'];
    if (key === undefined || key === '') {
      return failure(c, { ok: false, status: 400, code: 'bad_request' });
    }
    const out = await send(
      c,
      '/media/quarantine',
      {
        key,
        source: 'member',
        ...(report === null ? {} : { note: tr('moderation.report.quarantineNote', { report }) }),
      },
      MediaQuarantineResponse,
    );
    if (!out.ok) return failure(c, out);
    const opened = out.data?.report ?? report;
    return c.redirect(opened === null ? '/queue' : `/reports/${opened}`);
  });

  app.post('/appeals/:id/decide', async (c) => {
    const id = idOf(c.req.param('id'));
    if (id === null) return c.redirect('/appeals');
    const form = await formOf(c);
    const decision = AppealDecision.safeParse({
      outcome: form['outcome'],
      reply: form['reply'] ?? '',
    });
    if (!decision.success) return failure(c, { ok: false, status: 400, code: 'bad_request' });
    const out = await send(c, `/appeals/${id}/decision`, decision.data);
    if (!out.ok) return failure(c, out);
    return c.redirect(`/appeals?sel=${id}`);
  });

  return app;
}
