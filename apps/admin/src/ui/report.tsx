import type { EventEnvelope, ReportDetail } from '@kithfield/contracts';

import { categoryLabel, ruleLabel, tr } from '../copy';
import { formatAt } from '../time';
import { DecideForm } from './decide';
import { Head } from './shell';

export interface Person {
  readonly name: string | null;
  readonly species: string | null;
}

export interface ReportView {
  readonly detail: ReportDetail;
  readonly people: ReadonlyMap<string, Person>;
  readonly zone: string;
  readonly now: number;
}

const DAY_MS = 24 * 60 * 60_000;

/** What people said or shared; joins, care and the farm's own events are left out of the context. */
const CONTENT_KINDS = new Set([
  'message',
  'edit',
  'media',
  'voice',
  'sticker',
  'link',
  'status',
  'firefly',
]);

const nameOf = (view: ReportView, person: string | null) =>
  (person === null ? null : view.people.get(person)?.name) ?? tr('moderation.report.someone');
const kindOf = (view: ReportView, person: string | null) =>
  (person === null ? null : view.people.get(person)?.species) ?? 'rabbit';

const field = (payload: unknown, key: string): string | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

function EventBody(props: { event: EventEnvelope }) {
  const { event } = props;
  const id = `blur-${event.seq}`;
  if (field(event.payload, 'tombstone') !== null) {
    return <div class="msg-text gone">{tr('moderation.report.unsent')}</div>;
  }
  switch (event.kind) {
    case 'media':
      return (
        <div class="msg-text">
          <span id={id} class="blur">
            {field(event.payload, 'caption') ?? tr('moderation.report.photo')}
          </span>
          <button class="show" type="button" data-show={id}>
            {tr('moderation.report.show')}
          </button>
        </div>
      );
    case 'voice':
      return <div class="msg-text gone">{tr('moderation.report.voice')}</div>;
    case 'sticker':
      return <div class="msg-text gone">{tr('moderation.report.sticker')}</div>;
    default: {
      const text =
        field(event.payload, 'text') ??
        field(event.payload, 'url') ??
        field(event.payload, 'words');
      return (
        <div class={`msg-text${text === null ? ' gone' : ''}`}>
          {text ?? tr('moderation.what.other')}
        </div>
      );
    }
  }
}

function ageText(days: number) {
  return days < 60
    ? tr('moderation.report.ageDays', { count: days })
    : tr('moderation.report.ageMonths', { count: Math.floor(days / 30) });
}

export function ReportPage(view: ReportView) {
  const { detail, zone, now } = view;
  const reportedName = detail.reported.name ?? tr('moderation.report.someone');
  const farm = detail.farmName ?? tr('moderation.queue.visit');
  const urgentDue = detail.dueAt - detail.receivedAt <= DAY_MS / 2;
  const context = detail.context.filter((e) => e.actor !== null && CONTENT_KINDS.has(e.kind));
  const earlier = detail.signals.earlierReports;
  const aimed = detail.signals.aimedAt;
  return (
    <>
      <Head
        title={`${categoryLabel(detail.category)} · ${farm}`}
        lead={tr('moderation.report.meta', {
          count: detail.reasons.length,
          when: formatAt(detail.receivedAt, 'clock', zone, now),
          due: urgentDue ? tr('moderation.report.dueHour') : tr('moderation.report.dueDay'),
        })}
      >
        <a class="btn" href="/queue">
          ‹ {tr('moderation.report.back')}
        </a>
        <a class="btn" href={`/members/${detail.reported.person}?report=${detail.report}`}>
          {tr('moderation.report.record', { name: reportedName })}
        </a>
      </Head>
      <div class="r-grid">
        <div class="card pad">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <span class="eyebrow">{tr('moderation.report.context')}</span>
            <span class="pill">{tr('moderation.report.readOnly')}</span>
          </div>
          <div class="ctx">
            {context.length === 0 ? (
              <div class="note">{tr('moderation.report.contextGone')}</div>
            ) : null}
            {context.map((event) => {
              const hit = event.seq === detail.reportedSeq;
              return (
                <div class={`msg${hit ? ' hit' : ''}`}>
                  <kf-art scene="avatar" kind={kindOf(view, event.actor)} />
                  <div style="min-width:0">
                    <div class="msg-who">
                      {nameOf(view, event.actor)}{' '}
                      <span class="at">· {formatAt(event.at, 'clock', zone, now)}</span>
                      {hit ? (
                        <>
                          {' · '}
                          <span class="flagged">{tr('moderation.report.reported')}</span>
                        </>
                      ) : null}
                    </div>
                    <EventBody event={event} />
                  </div>
                </div>
              );
            })}
          </div>
          <div class="note">{tr('moderation.report.contextFoot')}</div>
        </div>
        <div class="stack">
          <div class="card pad" style="gap:10px">
            <span class="eyebrow">{tr('moderation.report.theReport')}</span>
            <div class="who-row">
              {tr('moderation.report.reporters', { count: detail.reasons.length })}
            </div>
            {detail.notes.map((note) => (
              <div class="quote">“{note}”</div>
            ))}
            <div class="note">{tr('moderation.report.neverNamed')}</div>
          </div>
          <div class="card pad" style="gap:0">
            <span class="eyebrow" style="margin-bottom:6px">
              {tr('moderation.report.signals')}
            </span>
            <div class="sig">
              <span>{tr('moderation.report.earlier', { name: reportedName })}</span>
              <span>{earlier === 0 ? tr('moderation.report.earlierNone') : earlier}</span>
            </div>
            <div class="sig">
              <span>{tr('moderation.report.age')}</span>
              <span>{ageText(detail.signals.accountAgeDays)}</span>
            </div>
            <div class="sig">
              <span>{tr('moderation.report.aimed')}</span>
              <span>
                {aimed === null
                  ? tr('moderation.report.aimedNo')
                  : tr('moderation.report.aimedYes', { name: nameOf(view, aimed) })}
              </span>
            </div>
            <div class="sig">
              <span>{tr('moderation.report.blocked')}</span>
              <span>
                {detail.signals.blockedBy === 0
                  ? tr('moderation.report.blockedNone')
                  : tr('moderation.report.blockedCount', { count: detail.signals.blockedBy })}
              </span>
            </div>
            <div class="sig">
              <span>{tr('moderation.report.suggested')}</span>
              <span>
                {detail.signals.suggestedRule === null
                  ? tr('moderation.report.suggestedNone')
                  : ruleLabel(detail.signals.suggestedRule)}
              </span>
            </div>
          </div>
        </div>
        <DecideForm detail={detail} name={reportedName} />
      </div>
    </>
  );
}
