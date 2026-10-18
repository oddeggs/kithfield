import type { ModeratorSelf } from '@kithfield/contracts';
import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';

import { tr } from '../copy';
import { formatAt } from '../time';
import { clientScript } from './client';
import { styles } from './styles';

export type Section = 'queue' | 'urgent' | 'appeals' | 'members' | 'audit' | 'rules';

export interface DeskCounts {
  /** Open reports; `+` when there are more than one page holds. */
  readonly queue: string;
  readonly urgent: number;
  readonly appeals: number;
}

export interface ShellProps {
  readonly title: string;
  readonly section: Section | null;
  readonly me: ModeratorSelf | null;
  readonly counts: DeskCounts | null;
  readonly zone: string;
  readonly now: number;
  readonly children: Child;
}

/** Moderators have no critter of their own; the desk gives each a steady one by their id. */
const DESK_CRITTERS = ['owl', 'fox', 'badger', 'hedgehog', 'otter', 'mole', 'rabbit', 'duck'];
export const critterFor = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DESK_CRITTERS[h % DESK_CRITTERS.length] ?? 'owl';
};

const Nav = (props: {
  href: string;
  icon: string;
  label: string;
  on: boolean;
  urgent?: boolean;
  count?: string | number | null;
  badge?: boolean;
}) => {
  const colour = props.urgent ? '#9a3b26' : '#2a221d';
  return (
    <a class={`nav${props.on ? ' on' : ''}${props.urgent ? ' urgent' : ''}`} href={props.href}>
      <kf-art scene="icon" name={props.icon} color={colour} />
      <span class="label">{props.label}</span>
      {props.count === null || props.count === undefined || props.count === 0 ? null : (
        <span class={props.badge ? 'badge' : 'count'}>{props.count}</span>
      )}
    </a>
  );
};

export function Shell(props: ShellProps) {
  const { section, counts, me } = props;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{`${props.title} · ${tr('moderation.desk')}`}</title>
        <style>{raw(styles)}</style>
        <script src="/art/kithfield-art.js" />
      </head>
      <body>
        <div class="app">
          <aside class="side">
            <a class="brand" href="/queue">
              <kf-art scene="appicon" />
              <div>
                <div class="brand-name">{tr('moderation.brand')}</div>
                <div class="brand-sub">{tr('moderation.desk')}</div>
              </div>
            </a>
            <Nav
              href="/queue"
              icon="chat"
              label={tr('moderation.nav.queue')}
              on={section === 'queue'}
              count={counts?.queue ?? null}
            />
            <Nav
              href="/queue?urgent=1"
              icon="bell"
              label={tr('moderation.nav.urgent')}
              on={section === 'urgent'}
              urgent
              count={counts?.urgent ?? null}
              badge
            />
            <Nav
              href="/appeals"
              icon="note"
              label={tr('moderation.nav.appeals')}
              on={section === 'appeals'}
              count={counts?.appeals ?? null}
            />
            <Nav
              href="/members"
              icon="search"
              label={tr('moderation.nav.members')}
              on={section === 'members'}
            />
            <Nav
              href="/audit"
              icon="clock"
              label={tr('moderation.nav.audit')}
              on={section === 'audit'}
            />
            <Nav
              href="/rules"
              icon="seed"
              label={tr('moderation.nav.rules')}
              on={section === 'rules'}
            />
            <div class="grow" />
            {me === null ? null : (
              <div class="shift">
                <div class="shift-who">
                  <kf-art scene="avatar" kind={critterFor(me.moderator)} />
                  <div>
                    <div class="shift-name">{me.name}</div>
                    <div class="shift-on">
                      {me.shiftEndsAt === null
                        ? tr('moderation.shift.on')
                        : tr('moderation.shift.until', {
                            time: formatAt(me.shiftEndsAt, 'clock', props.zone, props.now),
                          })}
                    </div>
                  </div>
                </div>
                <div class="shift-care">{tr('moderation.shift.care')}</div>
              </div>
            )}
          </aside>
          <main class="main">{props.children}</main>
        </div>
        <script>{raw(clientScript)}</script>
      </body>
    </html>
  );
}

/** A page heading with its lead and buttons. */
export const Head = (props: { title: string; lead: string; children?: Child }) => (
  <div class="head">
    <div>
      <div class="title">{props.title}</div>
      <div class="lead">{props.lead}</div>
    </div>
    {props.children === undefined ? null : <div class="actions">{props.children}</div>}
  </div>
);
