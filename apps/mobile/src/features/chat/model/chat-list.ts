import type { ChatListItem, PersonId } from '@kithfield/contracts';

import { clock } from './format';

/*
 * The chat list: farms and visits, each newest first with pinned rows on top. A row says
 * who said what last in plain words; a visit says whose porch it was said on.
 */

export interface ListSections {
  readonly farms: readonly ChatListItem[];
  readonly visits: readonly ChatListItem[];
}

const byPinThenNewest = (a: ChatListItem, b: ChatListItem) =>
  Number(b.pinned) - Number(a.pinned) || b.at - a.at || b.seq - a.seq;

/** Splits the cottage's rows into farms and visits, each pinned first, then newest first. */
export function sectionsOf(rows: readonly ChatListItem[]): ListSections {
  const sorted = [...rows].sort(byPinThenNewest);
  return {
    farms: sorted.filter((r) => r.farmKind === 'farm'),
    visits: sorted.filter((r) => r.farmKind === 'visit'),
  };
}

/** What the phone knows of the event a row points at, when it has it cached. */
export interface RowEvent {
  readonly kind: string;
  readonly payload: unknown;
}

export type WhatKey =
  | 'voice'
  | 'voiceShort'
  | 'photo'
  | 'photos'
  | 'video'
  | 'file'
  | 'sticker'
  | 'link'
  | 'dewdrop'
  | 'firefly'
  | 'wave'
  | 'knock'
  | 'hug'
  | 'quietNote'
  | 'slowPost'
  | 'plan'
  | 'unsent'
  | 'something';

const obj = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** For a row whose event has no words: what it was ("a voice note, 2:48", "a photo"). */
export function whatOf(
  kind: string,
  event: RowEvent | null,
): { readonly key: WhatKey; readonly duration?: string } {
  const p = obj(event?.payload);
  if ('tombstone' in p) return { key: 'unsent' };
  switch (kind) {
    case 'voice': {
      const ms = p['durationMs'];
      return typeof ms === 'number' ? { key: 'voice', duration: clock(ms) } : { key: 'voiceShort' };
    }
    case 'media': {
      const items = Array.isArray(p['items']) ? (p['items'] as { mime?: unknown }[]) : [];
      const mime = items[0]?.mime;
      const first = typeof mime === 'string' ? mime : '';
      if (items.length > 1) return { key: 'photos' };
      if (first.startsWith('video/')) return { key: 'video' };
      if (first !== '' && !first.startsWith('image/')) return { key: 'file' };
      return { key: 'photo' };
    }
    case 'sticker':
      return { key: 'sticker' };
    case 'link':
      return { key: 'link' };
    case 'dewdrop':
      return { key: 'dewdrop' };
    case 'firefly':
      return { key: 'firefly' };
    case 'wave':
      return { key: 'wave' };
    case 'knock':
      return { key: 'knock' };
    case 'hug':
      return { key: 'hug' };
    case 'quiet_note':
      return { key: 'quietNote' };
    case 'slow_post':
      return { key: 'slowPost' };
    case 'seed_planted':
      return { key: 'plan' };
    case 'unsend':
      return { key: 'unsent' };
    default:
      return { key: 'something' };
  }
}

/** Whose words a row shows: yours, a friend's by name, or nobody's (the farm's own news). */
export type Speaker =
  | { readonly kind: 'you' }
  | { readonly kind: 'friend'; readonly name: string }
  | { readonly kind: 'none' };

export function speakerOf(
  actor: PersonId | null,
  me: PersonId | null,
  nameOf: (person: PersonId) => string | null,
): Speaker {
  if (actor === null) return { kind: 'none' };
  if (actor === me) return { kind: 'you' };
  const name = nameOf(actor);
  return name === null ? { kind: 'none' } : { kind: 'friend', name };
}

/** Kinds that change a row but are nobody's news: opening the farm, the weather, edits. */
const QUIET_KINDS = new Set([
  'farm_opened',
  'weather',
  'shared_rain',
  'season_rolled',
  'harvested',
  'rules_changed',
  'restored',
  'hibernate',
  'status',
  'critter_changed',
  'settings_changed',
  'reaction',
  'edit',
  'unsend',
  'pin',
  'vote',
  'rsvp',
  'checkin',
  'fire',
  'farm_created',
]);

/** Whether a row's latest event is something to tell the person about. */
export const isNews = (kind: string): boolean => !QUIET_KINDS.has(kind);

/**
 * Something new waits on a farm: its latest news is someone else's and later than what this phone
 * has read in. Never a count.
 */
export function hasNews(row: ChatListItem, me: PersonId | null, readTo: number): boolean {
  return isNews(row.kind) && row.actor !== null && row.actor !== me && row.seq > readTo;
}
