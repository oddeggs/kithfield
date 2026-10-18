import type { QueueRow, ReportCategory } from '@kithfield/contracts';

import { categoryLabel, chipLabel, dueText, tr, whatLabel } from '../copy';
import { formatAt } from '../time';
import { Head } from './shell';

export interface QueueView {
  readonly rows: readonly QueueRow[];
  /** Counts by chip over every open report. */
  readonly counts: {
    all: string;
    urgent: number;
    byCategory: Partial<Record<ReportCategory, number>>;
  };
  readonly filter: { category: ReportCategory | null; urgent: boolean };
  readonly next: string | null;
  readonly more: string | null;
  readonly names: ReadonlyMap<string, string>;
  readonly flash: string | null;
  readonly zone: string;
  readonly now: number;
}

const CHIP_ORDER: readonly ReportCategory[] = [
  'harassment',
  'spam',
  'sexual_content',
  'hate',
  'impersonation',
  'under_13',
  'self_harm',
  'child_safety',
  'credible_threat',
  'other',
];

const farmOf = (row: QueueRow) => row.farmName ?? tr('moderation.queue.visit');

function withLabel(row: QueueRow, names: ReadonlyMap<string, string>) {
  if (row.claimedBy !== null) return names.get(row.claimedBy) ?? row.claimedBy;
  return row.source === 'member'
    ? tr('moderation.queue.unassigned')
    : tr('moderation.queue.autoFlag');
}

function Preview(props: { row: QueueRow; view: QueueView; hidden: boolean }) {
  const { row, view } = props;
  const due = dueText(row.dueAt, view.now);
  const late = row.dueAt <= view.now;
  const dueLine = late
    ? tr('moderation.preview.late')
    : row.urgent
      ? tr('moderation.preview.urgentDue', { due })
      : tr('moderation.preview.due', { due });
  const source =
    row.source === 'link_reputation'
      ? tr('moderation.preview.sourceLink')
      : row.source === 'hash_match'
        ? tr('moderation.preview.sourceHash')
        : tr('moderation.preview.reporters', { count: row.reporters });
  return (
    <div class="card preview" data-preview={row.report} hidden={props.hidden}>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="eyebrow">{tr('moderation.preview.title')}</span>
        <span
          style={`font:600 12px/1 -apple-system,system-ui;color:${row.urgent || late ? '#9a3b26' : '#5b5048'}`}
        >
          {dueLine}
        </span>
      </div>
      <div class="pv-cat">{categoryLabel(row.category)}</div>
      <div class="pv-what">
        {whatLabel(row.kind)} · {farmOf(row)}
      </div>
      <div class="pv-box">{source}</div>
      <div class="pv-hint">{tr('moderation.preview.hint')}</div>
      <div class="kv">
        <div>
          <span>{tr('moderation.preview.received')}</span>
          <span>{formatAt(row.receivedAt, 'day', view.zone, view.now)}</span>
        </div>
        <div>
          <span>{tr('moderation.preview.claimed')}</span>
          <span>{withLabel(row, view.names)}</span>
        </div>
      </div>
      <div class="grow" />
      <a class="big-btn" href={`/reports/${row.report}`}>
        {tr('moderation.preview.openReport')}
      </a>
      <div class="note center">{tr('moderation.preview.foot')}</div>
    </div>
  );
}

const Chip = (props: { href: string; on: boolean; label: string; count: string | number }) => (
  <a class={`chip${props.on ? ' on' : ''}`} href={props.href}>
    {props.label} {props.count}
  </a>
);

export function QueuePage(view: QueueView) {
  const { rows, filter, counts } = view;
  const selected = rows[0];
  return (
    <>
      <Head title={tr('moderation.queue.title')} lead={tr('moderation.queue.lead')}>
        <div style="position:relative;display:flex;gap:8px">
          <button class="btn" type="button" data-search-toggle>
            <kf-art scene="icon" name="search" />
            {tr('moderation.queue.search')}
          </button>
          <form class="card search" method="get" action="/reports" data-search>
            <label class="note" for="report-id">
              {tr('moderation.queue.searchLabel')}
            </label>
            <input
              class="field"
              id="report-id"
              name="id"
              placeholder={tr('moderation.queue.searchPlaceholder')}
              required
            />
            <button class="btn dark" type="submit">
              {tr('moderation.queue.open')}
            </button>
          </form>
          {view.next === null ? null : (
            <a class="btn dark" href={`/reports/${view.next}`}>
              {tr('moderation.queue.next')}
            </a>
          )}
        </div>
      </Head>
      {view.flash === null ? null : <div class="flash">{view.flash}</div>}
      <div class="chips">
        <Chip
          href="/queue"
          on={filter.category === null && !filter.urgent}
          label={tr('moderation.chip.all')}
          count={counts.all}
        />
        {counts.urgent > 0 ? (
          <Chip
            href="/queue?urgent=1"
            on={filter.urgent}
            label={tr('moderation.chip.urgent')}
            count={counts.urgent}
          />
        ) : null}
        {CHIP_ORDER.flatMap((category) => {
          const n = counts.byCategory[category] ?? 0;
          return n === 0
            ? []
            : [
                <Chip
                  href={`/queue?category=${category}`}
                  on={filter.category === category}
                  label={chipLabel(category)}
                  count={n}
                />,
              ];
        })}
      </div>
      <div class="queue">
        <div class="card table">
          <div class="qrow qhead">
            <span />
            <span>{tr('moderation.queue.col.received')}</span>
            <span>{tr('moderation.queue.col.category')}</span>
            <span>{tr('moderation.queue.col.what')}</span>
            <span>{tr('moderation.queue.col.farm')}</span>
            <span>{tr('moderation.queue.col.reporters')}</span>
            <span>{tr('moderation.queue.col.due')}</span>
            <span>{tr('moderation.queue.col.with')}</span>
          </div>
          {rows.length === 0 ? <div class="empty">{tr('moderation.queue.empty')}</div> : null}
          {rows.map((row) => {
            const late = row.dueAt <= view.now;
            const cls = `qrow qline${row.urgent ? ' urgent' : ''}${row === selected ? ' sel' : ''}`;
            return (
              <a class={cls} href={`/reports/${row.report}`} data-row={row.report} tabindex={0}>
                <span
                  class={`dot${row.urgent ? ' urgent' : row.source !== 'member' ? ' flag' : ''}`}
                />
                <span class="soft">{formatAt(row.receivedAt, 'clock', view.zone, view.now)}</span>
                <span class="strong clip">{categoryLabel(row.category)}</span>
                <span class="clip" style="color:#4a3f37">
                  {whatLabel(row.kind)}
                </span>
                <span class="clip">{farmOf(row)}</span>
                <span class="soft">{row.reporters}</span>
                <span class={`strong${row.urgent || late ? ' late' : ''}`}>
                  {dueText(row.dueAt, view.now)}
                </span>
                <span class="soft clip">{withLabel(row, view.names)}</span>
              </a>
            );
          })}
          {view.more === null ? null : (
            <a class="more" href={view.more}>
              {tr('moderation.queue.more')}
            </a>
          )}
        </div>
        {rows.length === 0 ? (
          <div />
        ) : (
          rows.map((row) => <Preview row={row} view={view} hidden={row !== selected} />)
        )}
      </div>
    </>
  );
}
