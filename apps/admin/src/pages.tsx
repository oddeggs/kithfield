import {
  AppealDetail,
  AppealPage,
  AuditPage as AuditPageBody,
  Id,
  MemberRecord,
  ModeratorSelf,
  QueuePage as QueuePageBody,
  type QueueRow,
  ReportCategory,
  ReportDetail,
  ResponseTimes,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import { read } from './api';
import { tr } from './copy';
import type { AdminEnv } from './env';
import { base, type Ctx, failure, page } from './render';
import { AppealsPage } from './ui/appeals';
import { AuditPage, RulesPage, SecondLookPage } from './ui/audit';
import { MemberPage, MembersSearch } from './ui/member';
import { QueuePage } from './ui/queue';
import { type Person, ReportPage } from './ui/report';

/* The desk's pages, server-rendered from the admin API. */

const quarterOf = (at: number) => {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};

const idOf = (value: string | undefined): string | null => {
  const parsed = Id.safeParse(value?.trim());
  return parsed.success ? parsed.data : null;
};

/** Whether the moderator at the desk is senior (the API decides; this only shapes the page). */
async function isSenior(c: Ctx): Promise<boolean> {
  const me = await read(c, '/me', ModeratorSelf);
  return me.ok && me.data.role === 'senior';
}

/** Names and critters for the people on a page, from their safety records. */
async function peopleOf(c: Ctx, ids: Iterable<string>): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)].slice(0, 30);
  const records = await Promise.all(
    unique.map(async (id) => [id, await read(c, `/members/${id}`, MemberRecord)] as const),
  );
  const people = new Map<string, Person>();
  for (const [id, record] of records) {
    if (record.ok) people.set(id, { name: record.data.name, species: record.data.species });
  }
  return people;
}

async function queue(c: Ctx) {
  const { zone, now } = base(c);
  const categoryParam = ReportCategory.safeParse(c.req.query('category'));
  const category = categoryParam.success ? categoryParam.data : null;
  const urgent = c.req.query('urgent') === '1';
  const cursor = c.req.query('cursor');
  const all = await read(c, '/queue', QueuePageBody);
  if (!all.ok) return failure(c, all);
  const params = new URLSearchParams();
  if (category !== null) params.set('category', category);
  if (cursor !== undefined) params.set('cursor', cursor);
  const shown =
    category === null && cursor === undefined
      ? all
      : await read(c, `/queue?${params.toString()}`, QueuePageBody);
  if (!shown.ok) return failure(c, shown);
  const rows: QueueRow[] = urgent ? shown.data.rows.filter((r) => r.urgent) : shown.data.rows;
  const byCategory: Partial<Record<ReportCategory, number>> = {};
  for (const row of all.data.rows) byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
  const me = await read(c, '/me', ModeratorSelf);
  const mine = me.ok ? me.data.moderator : null;
  const next =
    all.data.rows.find((r) => r.claimedBy === null || r.claimedBy === mine)?.report ?? null;
  if (shown.data.cursor !== null) params.set('cursor', shown.data.cursor);
  return page(
    c,
    urgent ? 'urgent' : 'queue',
    tr('moderation.queue.title'),
    <QueuePage
      rows={rows}
      counts={{
        all: `${all.data.rows.length}${all.data.cursor === null ? '' : '+'}`,
        urgent: all.data.rows.filter((r) => r.urgent).length,
        byCategory,
      }}
      filter={{ category, urgent }}
      next={next}
      more={shown.data.cursor === null ? null : `/queue?${params.toString()}`}
      names={new Map()}
      flash={c.req.query('done') === '1' ? tr('moderation.decide.done') : null}
      zone={zone}
      now={now}
    />,
  );
}

async function report(c: Ctx) {
  const id = idOf(c.req.param('id'));
  if (id === null) return c.redirect('/queue');
  const detail = await read(c, `/reports/${id}`, ReportDetail);
  if (!detail.ok) return failure(c, detail);
  const ids = detail.data.context.flatMap((e) => (e.actor === null ? [] : [e.actor]));
  const aimed = detail.data.signals.aimedAt;
  const people = await peopleOf(c, [...ids, ...(aimed === null ? [] : [aimed])]);
  const title = tr('moderation.report.theReport');
  const senior = await isSenior(c);
  return page(
    c,
    'queue',
    title,
    <ReportPage detail={detail.data} people={people} senior={senior} {...base(c)} />,
  );
}

async function member(c: Ctx) {
  const id = idOf(c.req.param('id'));
  if (id === null) return c.redirect('/members');
  const record = await read(c, `/members/${id}`, MemberRecord);
  if (!record.ok) {
    return record.status === 404 ? c.redirect(`/members?missing=1`) : failure(c, record);
  }
  const given = idOf(c.req.query('report'));
  const latest = record.data.history.find((h) => h.what === 'reported')?.report ?? null;
  return page(
    c,
    'members',
    record.data.name ?? tr('moderation.nav.members'),
    <MemberPage
      record={record.data}
      report={given ?? latest}
      suggestedRule={3}
      senior={await isSenior(c)}
      {...base(c)}
    />,
  );
}

async function appeals(c: Ctx) {
  const list = await read(c, '/appeals', AppealPage);
  if (!list.ok) return failure(c, list);
  const rows = list.data.rows;
  const selected =
    idOf(c.req.query('sel')) ?? rows.find((r) => r.status === 'open')?.appeal ?? null;
  let detail: AppealDetail | 'yours' | null = null;
  if (selected !== null) {
    const read1 = await read(c, `/appeals/${selected}`, AppealDetail);
    if (read1.ok) detail = read1.data;
    else if (read1.status === 403) detail = 'yours';
    else if (read1.status !== 404) return failure(c, read1);
  }
  const people = await peopleOf(
    c,
    rows.slice(0, 20).map((r) => r.person),
  );
  const species = new Map<string, string>();
  for (const [id, person] of people) if (person.species !== null) species.set(id, person.species);
  return page(
    c,
    'appeals',
    tr('moderation.appeals.title'),
    <AppealsPage rows={rows} selected={selected} detail={detail} species={species} {...base(c)} />,
  );
}

async function audit(c: Ctx) {
  const cursor = c.req.query('cursor');
  const [entries, times] = await Promise.all([
    read(
      c,
      `/audit${cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`}`,
      AuditPageBody,
    ),
    read(c, '/response-times?days=30', ResponseTimes),
  ]);
  if (!entries.ok) return failure(c, entries);
  if (!times.ok) return failure(c, times);
  const { now } = base(c);
  return page(
    c,
    'audit',
    tr('moderation.audit.title'),
    <AuditPage
      entries={entries.data.entries}
      times={times.data}
      older={
        entries.data.cursor === null
          ? null
          : `/audit?cursor=${encodeURIComponent(entries.data.cursor)}`
      }
      quarter={quarterOf(now)}
      {...base(c)}
    />,
  );
}

export function pageRoutes(): Hono<AdminEnv> {
  const app = new Hono<AdminEnv>();
  app.get('/', (c) => c.redirect('/queue'));
  app.get('/queue', queue);
  app.get('/reports', (c) => {
    const id = idOf(c.req.query('id'));
    return c.redirect(id === null ? '/queue' : `/reports/${id}`);
  });
  app.get('/reports/:id', report);
  app.get('/members', (c) => {
    const id = idOf(c.req.query('id'));
    if (id !== null) return c.redirect(`/members/${id}`);
    return page(
      c,
      'members',
      tr('moderation.members.title'),
      <MembersSearch notFound={c.req.query('missing') === '1'} />,
    );
  });
  app.get('/members/:id', member);
  app.get('/appeals', appeals);
  app.get('/audit', audit);
  app.get('/rules', (c) => page(c, 'rules', tr('moderation.rules.title'), <RulesPage />));
  app.get('/actions/:id', (c) => {
    const id = idOf(c.req.param('id'));
    if (id === null) return c.redirect('/queue');
    return page(
      c,
      'queue',
      tr('moderation.second.title'),
      <SecondLookPage action={id} report={idOf(c.req.query('report'))} />,
    );
  });
  return app;
}
