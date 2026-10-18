import {
  type EventEnvelope,
  LIMITS,
  type ReportRequest,
  type ReportReason,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { farmStub } from '../farm/http';
import { blockFromReport } from './blocking';
import { mintId, ruleToDb } from './ids';
import { aimedAt, categorize, dueAfter, excerptOf, suggestedRule } from './signals';
import { filingsOf, openReportFor } from './store';

/*
 * A member's report. The farm object copies the reported event and up to 20 around it (or, for a
 * person, the farm's latest 21) into the report, so the evidence survives an unsend. Everyone who
 * reports the same item while it is open joins one case.
 */

export type IntakeOutcome =
  | { ok: true; report: string }
  | { ok: false; status: 400 | 404; code: 'bad_request' | 'not_found'; fields?: string[] };

const AROUND = (LIMITS.reportContext - 1) / 2;

/** The copied context and the reported event, read as the reporter (a member) may read it. */
async function contextFor(
  env: Bindings,
  reporter: string,
  req: ReportRequest,
): Promise<{ context: EventEnvelope[]; event: EventEnvelope | null } | null> {
  const stub = farmStub(env, req.farm);
  const about = req.about;
  const page =
    about.about === 'event'
      ? await stub.page(reporter, {
          after: Math.max(0, about.seq - AROUND - 1),
          before: about.seq + AROUND + 1,
          limit: LIMITS.reportContext,
        })
      : await stub.page(reporter, { limit: LIMITS.reportContext });
  if (page === null) return null;
  const context = page.events as EventEnvelope[];
  const event = about.about === 'event' ? (context.find((e) => e.seq === about.seq) ?? null) : null;
  return { context, event };
}

/** Whether an event is aimed at a person: it mentions them, replies to them, or is sent to them. */
function aimsAt(
  event: EventEnvelope,
  context: readonly EventEnvelope[],
  person: string,
  now: (person: string) => string,
): boolean {
  const payload =
    typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : {};
  const mentions = payload['mentions'];
  if (Array.isArray(mentions) && mentions.some((m) => typeof m === 'string' && now(m) === person)) {
    return true;
  }
  if (typeof payload['to'] === 'string' && now(payload['to']) === person) return true;
  const replyTo = payload['replyTo'];
  const target = typeof replyTo === 'number' ? context.find((e) => e.seq === replyTo) : undefined;
  return target?.actor != null && now(target.actor) === person;
}

/** The farm's members and its merged-away people (merged-away id → kept id). */
async function whoIsWho(env: Bindings, farm: string) {
  const state = await farmStub(env, farm).state();
  const aliases: Readonly<Record<string, string>> = state?.aliases ?? {};
  return {
    /** Who a person is now: an author merged away since is reported as the kept person. */
    now: (person: string) => aliases[person] ?? person,
    livesHere: (person: string) => state?.members.some((m) => m.person === person) === true,
  };
}

export async function takeReport(
  env: Bindings,
  reporter: string,
  req: ReportRequest,
  now: number,
): Promise<IntakeOutcome> {
  const read = await contextFor(env, reporter, req);
  if (read === null) return { ok: false, status: 404, code: 'not_found' };
  const who = await whoIsWho(env, req.farm);
  const { event } = read;
  const me = who.now(reporter);

  let reported: string;
  if (req.about.about === 'event') {
    if (event === null) return { ok: false, status: 404, code: 'not_found' };
    if (event.actor === null || who.now(event.actor) === me || event.kind === 'settings_changed') {
      return { ok: false, status: 400, code: 'bad_request', fields: ['about.seq'] };
    }
    reported = who.now(event.actor);
  } else {
    reported = who.now(req.about.person);
    if (reported === me) {
      return { ok: false, status: 400, code: 'bad_request', fields: ['about.person'] };
    }
    if (!who.livesHere(reported)) return { ok: false, status: 404, code: 'not_found' };
  }

  // About a person: only their own words, and words aimed at them, are copied.
  const context =
    req.about.about === 'event'
      ? read.context
      : read.context.filter(
          (e) =>
            (e.actor !== null && who.now(e.actor) === reported) ||
            aimsAt(e, read.context, reported, who.now),
        );
  const seq = req.about.about === 'event' ? req.about.seq : null;
  const item = { farm: req.farm, reported, seq };
  const note = req.note ?? null;
  const excerpt = excerptOf(event);

  const file = (report: string) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO report_filings (report_id, reporter_id, reason, note, also_block, filed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(report, reporter, req.reason, note, req.alsoBlock ? 1 : 0, now);

  let report = await openReportFor(env.DB, item);
  if (report === null) {
    const { category, urgent } = categorize([req.reason], [excerpt, note]);
    const id = mintId('R');
    const created = await env.DB.prepare(
      `INSERT OR IGNORE INTO reports (id, farm_id, reported_id, seq, kind, event_at, category, urgent,
         source, status, aimed_at, suggested_rule, excerpt, context_json, received_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'member', 'open', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        req.farm,
        reported,
        seq,
        event?.kind ?? null,
        event?.at ?? null,
        category,
        urgent ? 1 : 0,
        aimedAt(event, context, reported),
        ruleToDb(suggestedRule(category)),
        excerpt,
        JSON.stringify(context),
        now,
        now + dueAfter(urgent),
      )
      .run();
    if (created.meta.changes > 0) {
      await file(id).run();
      if (req.alsoBlock) await blockFromReport(env, reporter, reported);
      return { ok: true, report: id };
    }
    // Someone else opened the case a moment earlier: join it.
    report = await openReportFor(env.DB, item);
    if (report === null) return { ok: false, status: 404, code: 'not_found' };
  }

  await file(report.id).run();
  // A later filing can make a case more serious, never less.
  const filings = await filingsOf(env.DB, report.id);
  const reasons: ReportReason[] = filings.map((f) => f.reason);
  const lifted = categorize(reasons, [report.excerpt, ...filings.map((f) => f.note)]);
  if (lifted.urgent && !report.urgent) {
    await env.DB.prepare(
      'UPDATE reports SET category = ?, urgent = 1, suggested_rule = ?, due_at = MIN(due_at, ?) WHERE id = ?',
    )
      .bind(
        lifted.category,
        ruleToDb(suggestedRule(lifted.category)),
        report.receivedAt + dueAfter(true),
        report.id,
      )
      .run();
  }
  if (req.alsoBlock) await blockFromReport(env, reporter, reported);
  return { ok: true, report: report.id };
}
