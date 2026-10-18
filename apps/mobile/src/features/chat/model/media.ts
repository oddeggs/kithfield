import { isTombstone, type MediaRef, type PersonId } from '@kithfield/contracts';

import { monthKey } from './format';
import type { LogEvent } from './timeline';

/*
 * Shared media and the viewer: every photo, video, link and voice note on a farm,
 * one entry per item, newest first, grouped by month.
 */

export type MediaTab = 'photos' | 'videos' | 'links' | 'voice';

export interface SharedItem {
  readonly seq: number;
  /** Which item of its message (a message may carry several photos). */
  readonly index: number;
  readonly at: number;
  readonly actor: PersonId | null;
  readonly tab: MediaTab;
  readonly ref: MediaRef | null;
  /** For links: where it goes and what it's called. */
  readonly url?: string;
  readonly title?: string;
  readonly site?: string;
  readonly durationMs?: number;
}

const obj = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

export const isVideo = (ref: MediaRef) => ref.mime.startsWith('video/');
export const isImage = (ref: MediaRef) => ref.mime.startsWith('image/');

/** A link's site, as people say it: `hollowcreek.org`. */
export function siteOf(url: string): string {
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] ?? url;
  return host.replace(/^www\./i, '').replace(/:\d+$/, '');
}

/** Every shared item in the events, newest first, leaving out what was unsent. */
export function sharedItems(events: readonly LogEvent[]): SharedItem[] {
  const gone = new Set<number>();
  for (const e of events) {
    if (e.kind !== 'unsend' || isTombstone(e.payload)) continue;
    const target = obj(e.payload)['target'];
    if (typeof target === 'number') gone.add(target);
  }
  const out: SharedItem[] = [];
  for (const e of events) {
    if (!e.known || gone.has(e.seq) || isTombstone(e.payload)) continue;
    const p = obj(e.payload);
    const base = { seq: e.seq, at: e.at, actor: e.actor };
    if (e.kind === 'media' && Array.isArray(p['items'])) {
      (p['items'] as MediaRef[]).forEach((ref, index) => {
        if (isImage(ref)) out.push({ ...base, index, tab: 'photos', ref });
        else if (isVideo(ref)) {
          out.push({
            ...base,
            index,
            tab: 'videos',
            ref,
            ...(ref.durationMs ? { durationMs: ref.durationMs } : {}),
          });
        }
      });
    } else if (e.kind === 'voice' && typeof p['audio'] === 'object') {
      const ms = p['durationMs'];
      out.push({
        ...base,
        index: 0,
        tab: 'voice',
        ref: p['audio'] as MediaRef,
        ...(typeof ms === 'number' ? { durationMs: ms } : {}),
      });
    } else if (e.kind === 'link' && typeof p['url'] === 'string') {
      const preview = obj(p['preview']);
      const title = typeof preview['title'] === 'string' ? preview['title'] : undefined;
      out.push({
        ...base,
        index: 0,
        tab: 'links',
        ref: (preview['image'] as MediaRef | undefined) ?? null,
        url: p['url'],
        site: typeof preview['site'] === 'string' ? preview['site'] : siteOf(p['url']),
        ...(title ? { title } : {}),
      });
    }
  }
  return out.sort((a, b) => b.seq - a.seq || a.index - b.index);
}

export interface MonthGroup {
  readonly month: string;
  readonly at: number;
  readonly items: readonly SharedItem[];
}

/** Items grouped by the month they were shared in, newest month first. */
export function byMonth(
  items: readonly SharedItem[],
  timeZone: string | null = null,
): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const item of items) {
    const month = monthKey(item.at, timeZone);
    const last = groups.at(-1);
    if (last && last.month === month) (last.items as SharedItem[]).push(item);
    else groups.push({ month, at: item.at, items: [item] });
  }
  return groups;
}

/** What the viewer pages through: photos and videos, oldest first like the chat. */
export function viewable(items: readonly SharedItem[]): SharedItem[] {
  return items.filter((i) => i.tab === 'photos' || i.tab === 'videos').reverse();
}
