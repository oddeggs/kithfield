import type { ReportDetail, RuleRef } from '@kithfield/contracts';

import { ALL_RULES, ruleLabel, tr } from '../copy';

/* The decision on a report: the options, the rule, who hears, and why, for the log. */

type Option = {
  value: string;
  title: string;
  sub: string;
  apply: string;
  sev: number;
  ruleFree?: boolean;
  brick?: boolean;
  note?: string;
};

function options(detail: ReportDetail, name: string): Option[] {
  const aboutEvent = detail.reportedSeq !== null;
  const all: (Option | null)[] = [
    {
      value: 'dismiss',
      title: tr('moderation.decide.dismiss'),
      sub: tr('moderation.decide.dismissSub'),
      apply: tr('moderation.decide.apply.dismiss'),
      sev: 0,
      ruleFree: true,
    },
    aboutEvent
      ? {
          value: 'remove',
          title: tr('moderation.decide.remove'),
          sub: tr('moderation.decide.removeSub', { name }),
          apply: tr('moderation.decide.apply.remove'),
          sev: 1,
        }
      : null,
    aboutEvent
      ? {
          value: 'warn',
          title: tr('moderation.decide.warn'),
          sub: tr('moderation.decide.warnSub'),
          apply: tr('moderation.decide.apply.warn'),
          sev: 1,
        }
      : null,
    {
      value: 'pause',
      title: tr('moderation.decide.pause'),
      sub: tr('moderation.decide.pauseSub'),
      apply: tr('moderation.decide.apply.pause', { name }),
      sev: 2,
    },
    aboutEvent
      ? null
      : {
          value: 'farm',
          title: tr('moderation.decide.farm'),
          sub: tr('moderation.decide.farmSub'),
          apply: tr('moderation.decide.apply.farm', { name }),
          sev: 2,
        },
    {
      value: 'ban',
      title: tr('moderation.decide.ban'),
      sub: tr('moderation.decide.banSub'),
      apply: tr('moderation.decide.apply.ban'),
      sev: 3,
      brick: true,
      note: tr('moderation.decide.banNote'),
    },
    {
      value: 'escalate',
      title: tr('moderation.decide.escalate'),
      sub: tr('moderation.decide.escalateSub'),
      apply: tr('moderation.decide.apply.escalate'),
      sev: 3,
      ruleFree: true,
    },
  ];
  return all.filter((o): o is Option => o !== null);
}

/** The rule picker; each option carries the line under the apply button. */
export function RulePicker(props: { picked: RuleRef }) {
  return (
    <label class="rule-row">
      <span>{tr('moderation.decide.rule')}</span>
      <select name="rule">
        {ALL_RULES.map((rule) => (
          <option
            value={String(rule)}
            selected={rule === props.picked}
            data-logged={tr('moderation.decide.logged', { rule: ruleLabel(rule) })}
          >
            {ruleLabel(rule)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DecideForm(props: { detail: ReportDetail; name: string; senior: boolean }) {
  const { detail } = props;
  const reportedName = props.name;
  // Removal from Kithfield and legal escalation are a senior moderator's.
  const opts = options(detail, reportedName).filter((o) => props.senior || o.value !== 'ban');
  const first = opts.find((o) => o.value === 'warn') ?? opts[0];
  const picked: RuleRef = detail.signals.suggestedRule ?? 3;
  return (
    <form
      class="card pad decide"
      method="post"
      action={`/reports/${detail.report}/decide`}
      data-decide
      data-claim={`/admin/v1/reports/${detail.report}/claim`}
    >
      <span class="eyebrow">{tr('moderation.decide.title')}</span>
      {opts.map((o) => (
        <>
          <label class="opt">
            <input
              type="radio"
              name="action"
              value={o.value}
              checked={o === first}
              required
              data-label={o.apply}
              data-sev={String(o.sev)}
              data-rule={o.ruleFree ? 'free' : 'needed'}
              data-note={o.note ?? ''}
            />
            <span class="radio" />
            <div style="min-width:0">
              <div class={`opt-t${o.brick ? ' brick' : ''}`}>{o.title}</div>
              <div class="opt-s">{o.sub}</div>
            </div>
          </label>
          {o.value === 'escalate' ? (
            <div class="opt-more">
              <label class="chip">
                <input type="radio" name="escalate" value="urgent" checked />
                {tr('moderation.decide.escalateUrgent')}
              </label>
              {props.senior ? (
                <label class="chip">
                  <input type="radio" name="escalate" value="legal" />
                  {tr('moderation.decide.escalateLegal')}
                </label>
              ) : null}
            </div>
          ) : null}
        </>
      ))}
      <label class="toggle" style="padding-top:4px">
        <span>{tr('moderation.decide.tellReporters')}</span>
        <input type="checkbox" name="tellReporters" value="1" checked />
        <span class="switch" />
      </label>
      <label class="toggle">
        <span>{tr('moderation.decide.tellMember', { name: reportedName })}</span>
        <input type="checkbox" name="tellMember" value="1" checked />
        <span class="switch" />
      </label>
      <RulePicker picked={picked} />
      <input
        class="field"
        name="note"
        maxlength={1000}
        required
        placeholder={tr('moderation.decide.reason')}
      />
      <button
        class={`big-btn push${(first?.sev ?? 0) >= 2 ? ' brick' : ''}`}
        type="submit"
        data-apply
      >
        {first?.apply}
      </button>
      <div class="note center" data-apply-note data-free={tr('moderation.decide.loggedNoRule')}>
        {tr('moderation.decide.logged', { rule: ruleLabel(picked) })}
      </div>
    </form>
  );
}
