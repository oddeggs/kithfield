import type { AppealDetail, AppealRow } from '@kithfield/contracts';

import { actionLabel, agoText, categoryLabel, ruleLabel, tr } from '../copy';
import { formatAt } from '../time';
import { Head } from './shell';

export interface AppealsView {
  readonly rows: readonly AppealRow[];
  readonly selected: string | null;
  /** The selected appeal, or `yours` when this moderator touched its report. */
  readonly detail: AppealDetail | 'yours' | null;
  readonly species: ReadonlyMap<string, string>;
  readonly zone: string;
  readonly now: number;
}

const kindOf = (view: AppealsView, person: string) => view.species.get(person) ?? 'rabbit';

function Detail(props: { view: AppealsView; detail: AppealDetail }) {
  const { view, detail } = props;
  const name = detail.name ?? tr('moderation.report.someone');
  const decidedBy = detail.decidedByName;
  const open = detail.status === 'open';
  return (
    <div class="card a-detail">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <kf-art
            scene="avatar"
            kind={kindOf(view, detail.person)}
            style="width:36px;height:36px;border-radius:18px;overflow:hidden;flex:none"
          />
          <div>
            <div class="a-title">{tr('moderation.appeals.asks', { name })}</div>
            <div class="a-meta">
              {tr('moderation.appeals.meta', {
                report: detail.report,
                when: formatAt(detail.sentAt, 'inline', view.zone, view.now),
              })}
            </div>
          </div>
        </div>
        <span class="pill moss">
          {detail.reviewer === null
            ? tr('moderation.appeals.unassigned')
            : tr('moderation.appeals.reviewing', { name: detail.reviewer })}
        </span>
      </div>
      <div class="a-two">
        <div class="box">
          <span class="eyebrow">{tr('moderation.appeals.first')}</span>
          <div class="box-t">
            {detail.rule === null
              ? actionLabel(detail.decision)
              : `${actionLabel(detail.decision)} · ${ruleLabel(detail.rule, false)}`}
          </div>
          <div class="box-s">
            {tr('moderation.appeals.firstBy', {
              name: decidedBy,
              when: formatAt(detail.decidedAt, 'inline', view.zone, view.now),
            })}
          </div>
        </div>
        <div class="box">
          <span class="eyebrow">{tr('moderation.appeals.message')}</span>
          {detail.excerpt === null ? (
            <div class="box-s">{tr('moderation.appeals.noExcerpt')}</div>
          ) : (
            <div class="box-t">“{detail.excerpt}”</div>
          )}
        </div>
      </div>
      <div class="box line">
        <span class="eyebrow">{tr('moderation.appeals.wrote', { name })}</span>
        <div style="font:14.5px/1.5 -apple-system,system-ui">“{detail.text}”</div>
      </div>
      {open ? (
        <form
          method="post"
          action={`/appeals/${detail.appeal}/decide`}
          style="display:flex;flex-direction:column;gap:14px;flex:1"
        >
          <label style="display:flex;flex-direction:column;gap:6px">
            <span class="eyebrow">{tr('moderation.appeals.reply', { name })}</span>
            <textarea
              class="field"
              name="reply"
              rows={3}
              maxlength={2000}
              required
              placeholder={tr('moderation.appeals.replyPlaceholder')}
            />
          </label>
          <div class="push" style="display:flex;gap:10px;justify-content:flex-end">
            {/* Nothing lets a removed member back in yet, so those decisions can only be kept. */}
            {detail.decision === 'remove_from_farm' ||
            detail.decision === 'remove_from_kithfield' ? null : (
              <button class="btn" type="submit" name="outcome" value="undo">
                {tr('moderation.appeals.undo')}
              </button>
            )}
            <button class="btn dark" type="submit" name="outcome" value="keep">
              {tr('moderation.appeals.keep')}
            </button>
          </div>
        </form>
      ) : (
        <div class="flash" style="margin:0">
          {detail.status === 'kept'
            ? tr('moderation.appeals.kept')
            : tr('moderation.appeals.undone')}
        </div>
      )}
    </div>
  );
}

export function AppealsPage(view: AppealsView) {
  return (
    <>
      <Head title={tr('moderation.appeals.title')} lead={tr('moderation.appeals.lead')} />
      <div class="a-grid">
        <div class="card a-list">
          {view.rows.length === 0 ? (
            <div class="empty">{tr('moderation.appeals.empty')}</div>
          ) : null}
          {view.rows.map((row) => (
            <a
              class={`a-row${row.appeal === view.selected ? ' sel' : ''}`}
              href={`/appeals?sel=${row.appeal}`}
            >
              <kf-art scene="avatar" kind={kindOf(view, row.person)} />
              <div style="flex:1;min-width:0">
                <div class="a-name">{row.name ?? tr('moderation.report.someone')}</div>
                <div class="a-sub clip">
                  {actionLabel(row.decision)} · {categoryLabel(row.category).toLowerCase()}
                </div>
              </div>
              <span class="a-age">{agoText(row.sentAt, view.now)}</span>
            </a>
          ))}
        </div>
        {view.detail === null ? (
          <div />
        ) : view.detail === 'yours' ? (
          <div class="card a-detail">
            <div class="empty">{tr('moderation.appeals.yours')}</div>
          </div>
        ) : (
          <Detail view={view} detail={view.detail} />
        )}
      </div>
    </>
  );
}
