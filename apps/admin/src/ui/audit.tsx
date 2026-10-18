import type { AuditEntry, ResponseTimes } from '@kithfield/contracts';

import { actionLabel, ALL_RULES, medianText, percentText, ruleLabel, tr } from '../copy';
import { formatAt } from '../time';
import { Head } from './shell';

export interface AuditView {
  readonly entries: readonly AuditEntry[];
  readonly times: ResponseTimes;
  readonly older: string | null;
  readonly quarter: string;
  readonly zone: string;
  readonly now: number;
}

const Stat = (props: { value: string; title: string; sub: string }) => (
  <div class="card stat">
    <div class="stat-v">{props.value}</div>
    <div class="stat-t">{props.title}</div>
    <div class="stat-s">{props.sub}</div>
  </div>
);

export function AuditPage(view: AuditView) {
  const { times } = view;
  const appeals = times.appealsWithinWeek;
  const standard = times.standardWithinDay;
  return (
    <>
      <Head title={tr('moderation.audit.title')} lead={tr('moderation.audit.lead')}>
        <a class="btn" href={`/audit.csv?quarter=${view.quarter}`}>
          {tr('moderation.audit.export')}
        </a>
      </Head>
      <div class="stats">
        <Stat
          value={medianText(times.medianFirstActionMs)}
          title={tr('moderation.audit.median')}
          sub={tr('moderation.audit.medianSub', { days: times.days })}
        />
        <Stat
          value={tr('moderation.audit.of', {
            met: times.urgentWithinHour.met,
            due: times.urgentWithinHour.due,
          })}
          title={tr('moderation.audit.urgent')}
          sub={tr('moderation.audit.urgentSub')}
        />
        <Stat
          value={percentText(standard.met, standard.due)}
          title={tr('moderation.audit.standard')}
          sub={tr('moderation.audit.ranOver', { count: standard.due - standard.met })}
        />
        <Stat
          value={percentText(appeals.met, appeals.due)}
          title={tr('moderation.audit.appeals')}
          sub={tr('moderation.audit.appealsSub', {
            count: appeals.due,
            overturned: times.appealsOverturned,
          })}
        />
      </div>
      <div class="never">{tr('moderation.audit.never')}</div>
      <div class="card audit">
        <div class="arow eyebrow">
          <span>{tr('moderation.audit.col.when')}</span>
          <span>{tr('moderation.audit.col.who')}</span>
          <span>{tr('moderation.audit.col.action')}</span>
          <span>{tr('moderation.audit.col.item')}</span>
          <span>{tr('moderation.audit.col.rule')}</span>
          <span>{tr('moderation.audit.col.reason')}</span>
        </div>
        {view.entries.map((entry) => (
          <div class="arow line">
            <span>{formatAt(entry.at, 'day', view.zone, view.now)}</span>
            <span>{entry.byName ?? tr('moderation.audit.system')}</span>
            <span class="strong">{actionLabel(entry.what)}</span>
            <span>
              <a href={`/reports/${entry.item}`} style="text-decoration:none">
                {entry.item}
              </a>
            </span>
            <span>
              {entry.rule === null ? tr('moderation.audit.none') : ruleLabel(entry.rule, false)}
            </span>
            <span>{entry.reason ?? tr('moderation.audit.none')}</span>
          </div>
        ))}
        {view.older === null ? null : (
          <a class="more" href={view.older}>
            {tr('moderation.audit.older')}
          </a>
        )}
      </div>
    </>
  );
}

export function RulesPage() {
  return (
    <>
      <Head title={tr('moderation.rules.title')} lead={tr('moderation.rules.lead')} />
      <div class="page">
        <div class="card rules">
          {ALL_RULES.map((rule) => {
            const label = ruleLabel(rule);
            const named = label !== ruleLabel(rule, false) || typeof rule === 'string';
            return (
              <div class="sig">
                <span>{ruleLabel(rule, false)}</span>
                <span>{named ? label : tr('moderation.rules.unnamed')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function SecondLookPage(props: { action: string; report: string | null }) {
  return (
    <>
      <Head title={tr('moderation.second.title')} lead={tr('moderation.second.lead')} />
      <div class="page">
        <form
          class="card pad"
          method="post"
          action={`/actions/${props.action}/approve`}
          style="max-width:520px"
        >
          <div class="flash warn" style="margin:0">
            {tr('moderation.decide.awaiting')}
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn dark" type="submit" style="background:#9a3b26">
              {tr('moderation.second.agree')}
            </button>
            {props.report === null ? null : (
              <a class="btn" href={`/reports/${props.report}`}>
                {tr('moderation.second.report')}
              </a>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

export function ErrorPage(props: { message: string }) {
  return (
    <>
      <Head title={tr('moderation.error.title')} lead={props.message} />
      <div class="page">
        <div>
          <a class="btn" href="/queue">
            ‹ {tr('moderation.error.back')}
          </a>
        </div>
      </div>
    </>
  );
}
