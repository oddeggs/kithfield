import type { MemberRecord, RuleRef } from '@kithfield/contracts';

import { actionLabel, ruleLabel, speciesLabel, tr } from '../copy';
import { formatAt } from '../time';
import { RulePicker } from './decide';
import { Head } from './shell';

export interface MemberView {
  readonly record: MemberRecord;
  /** The report account actions are taken on, and the one to go back to. */
  readonly report: string | null;
  readonly suggestedRule: RuleRef;
  /** Only a senior moderator may ask to remove someone from Kithfield. */
  readonly senior: boolean;
  readonly zone: string;
  readonly now: number;
}

type Entry = MemberRecord['history'][number];

const dotFor = (entry: Entry) =>
  entry.what === 'joined'
    ? 'moss'
    : entry.what === 'reported'
      ? 'clay'
      : entry.what === 'actioned'
        ? 'honey'
        : '';

function HistoryRow(props: { entry: Entry; index: number; view: MemberView }) {
  const { entry, view } = props;
  const at = formatAt(entry.at, entry.what === 'joined' ? 'month' : 'day', view.zone, view.now);
  let title: string;
  const sub: string[] = [];
  switch (entry.what) {
    case 'joined':
      title = tr('moderation.member.joined');
      break;
    case 'reported':
      title = tr('moderation.member.reportedRow');
      break;
    case 'appealed':
      title = tr('moderation.member.appealed');
      break;
    case 'dismissed':
    case 'actioned': {
      const label =
        entry.action === null ? tr('moderation.action.dismiss') : actionLabel(entry.action);
      title = entry.rule === null ? label : `${label} · ${ruleLabel(entry.rule, false)}`;
      if (entry.by !== null) sub.push(tr('moderation.member.by', { name: entry.by }));
      break;
    }
  }
  return (
    <div class="hist" style={`--i:${props.index}`}>
      <span class={`hdot ${dotFor(entry)}`} />
      <span class="hist-at">{at}</span>
      <div>
        <div class="hist-t">{title}</div>
        {entry.report === null && sub.length === 0 ? null : (
          <div class="hist-s">
            {sub.join(' · ')}
            {sub.length > 0 && entry.report !== null ? ' · ' : ''}
            {entry.report === null ? null : <a href={`/reports/${entry.report}`}>{entry.report}</a>}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountAction(props: {
  view: MemberView;
  action: 'pause' | 'farm' | 'ban';
  title: string;
  sub: string;
  brick?: boolean;
}) {
  const { view } = props;
  return (
    <details class="act">
      <summary>
        <div class="grow">
          <div class={`opt-t${props.brick ? ' brick' : ''}`}>{props.title}</div>
          <div class="opt-s" style="margin-top:0">
            {props.sub}
          </div>
        </div>
        <span class="chev">›</span>
      </summary>
      {view.report === null ? (
        <form>
          <div class="note">{tr('moderation.member.needsReport')}</div>
        </form>
      ) : (
        <form method="post" action={`/reports/${view.report}/decide`}>
          <input type="hidden" name="action" value={props.action} />
          <input type="hidden" name="tellReporters" value="1" />
          <input type="hidden" name="tellMember" value="1" />
          <input
            type="hidden"
            name="back"
            value={`/members/${view.record.person}?report=${view.report}`}
          />
          <RulePicker picked={view.suggestedRule} />
          <input
            class="field"
            name="note"
            maxlength={1000}
            required
            placeholder={tr('moderation.decide.reason')}
          />
          <button class={`btn dark${props.brick ? ' brick' : ''}`} type="submit">
            {tr('moderation.member.apply')}
          </button>
        </form>
      )}
    </details>
  );
}

export function MemberPage(view: MemberView) {
  const { record } = view;
  const name = record.name ?? tr('moderation.report.someone');
  const species = speciesLabel(record.species);
  const farmNames = record.farms.map((f) => f.name ?? tr('moderation.queue.visit'));
  return (
    <>
      <Head
        title={name}
        lead={tr('moderation.member.meta', {
          species,
          since: formatAt(record.joinedAt, 'monthLong', view.zone, view.now),
          count: record.farms.length,
        })}
      >
        {view.report === null ? null : (
          <a class="btn" href={`/reports/${view.report}`}>
            ‹ {tr('moderation.member.back')}
          </a>
        )}
      </Head>
      <div class="m-grid">
        <div class="card pad" style="padding:16px 20px;gap:0">
          <div class="standing">
            <kf-art scene="avatar" kind={record.species ?? 'rabbit'} />
            <div class="grow">
              <div style="display:flex;gap:8px;align-items:center">
                <span class="standing-t">{tr('moderation.member.standing')}</span>
                <span class="pill honey">
                  {record.pausedUntil !== null
                    ? tr('moderation.member.paused', {
                        date: formatAt(record.pausedUntil, 'date', view.zone, view.now),
                      })
                    : record.warnings > 0
                      ? tr('moderation.member.warnings', { count: record.warnings })
                      : tr('moderation.member.good')}
                </span>
              </div>
              <div class="lead" style="font-size:13px;margin-top:3px">
                {tr('moderation.member.fade')}
              </div>
            </div>
          </div>
          <span class="eyebrow" style="padding:6px 0">
            {tr('moderation.member.history')}
          </span>
          <div class="ctx" style="gap:0">
            {record.history.map((entry, index) => (
              <HistoryRow entry={entry} index={index} view={view} />
            ))}
          </div>
          <div class="note push">{tr('moderation.member.foot', { name })}</div>
        </div>
        <div class="stack">
          <div class="card pad" style="gap:0">
            <div class="sig">
              <span>{tr('moderation.member.farms')}</span>
              <span>
                {farmNames.length === 0 ? tr('moderation.member.noFarms') : farmNames.join(', ')}
              </span>
            </div>
            <div class="sig">
              <span>{tr('moderation.member.blocked')}</span>
              <span>{tr('moderation.report.blockedCount', { count: record.blockedBy })}</span>
            </div>
            <div class="sig">
              <span>{tr('moderation.member.made', { name })}</span>
              <span>{record.reportsMade}</span>
            </div>
            <div class="sig">
              <span>{tr('moderation.member.appeals')}</span>
              <span>
                {record.openAppeals === 0
                  ? tr('moderation.member.appealsNone')
                  : tr('moderation.member.appealsOpen', { count: record.openAppeals })}
              </span>
            </div>
          </div>
          <div class="card pad" style="gap:10px">
            <span class="eyebrow">{tr('moderation.member.accountActions')}</span>
            <AccountAction
              view={view}
              action="pause"
              title={tr('moderation.decide.pause')}
              sub={tr('moderation.decide.pauseSub')}
            />
            <AccountAction
              view={view}
              action="farm"
              title={tr('moderation.decide.farm')}
              sub={tr('moderation.decide.farmSub')}
            />
            {view.senior ? (
              <AccountAction
                view={view}
                action="ban"
                title={tr('moderation.decide.ban')}
                sub={tr('moderation.decide.banSub')}
                brick
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export function MembersSearch(props: { notFound: boolean }) {
  return (
    <>
      <Head title={tr('moderation.members.title')} lead={tr('moderation.members.lead')} />
      <div class="page">
        <form
          class="card pad"
          method="get"
          action="/members"
          style="max-width:520px;flex-direction:row;align-items:center"
        >
          <input
            class="field"
            name="id"
            required
            placeholder={tr('moderation.members.placeholder')}
          />
          <button class="btn dark" type="submit">
            {tr('moderation.members.find')}
          </button>
        </form>
        {props.notFound ? (
          <div class="flash warn" style="margin:0;max-width:520px">
            {tr('moderation.members.notFound')}
          </div>
        ) : null}
      </div>
    </>
  );
}
