import type { Translate } from '@kithfield/i18n';

import { DRAWN_SEATS } from './seats';

/*
 * The fire room as the screen reads it: who is by the fire and how, from LiveKit's participants,
 * reduced to what the screen draws. Nothing here says how long anyone stayed.
 */

export type FireMode = 'join' | 'listen';

/** One person by the fire. */
export interface FirePerson {
  readonly id: string;
  readonly you: boolean;
  readonly mode: FireMode;
  /** Their mic is open (published and not muted). */
  readonly mic: boolean;
  /** LiveKit hears them talking now. */
  readonly speaking: boolean;
  /** Their connection is poor or lost: the critter dozes and their audio is paused. */
  readonly weak: boolean;
  /** Their lantern (camera) is lit. */
  readonly lantern: boolean;
  /** They are sharing their screen. */
  readonly sharing: boolean;
  /** They said yes to captions. */
  readonly captionsOk: boolean;
  /** When they sat down (LiveKit's join time, ms), for the order of the seats. */
  readonly joinedAt: number;
}

/** People in the order they sat down, so seats agree on every phone. */
export const bySitting = (people: readonly FirePerson[]): FirePerson[] =>
  [...people].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** What the panel at the bottom shows for you. */
export type DockState = 'listening' | 'muted' | 'talking';

export const dockStateOf = (you: FirePerson | null): DockState =>
  you === null || you.mode === 'listen' ? 'listening' : you.mic ? 'talking' : 'muted';

/** How the room lays out: critters around the fire, or lanterns for people with video. */
export type Layout =
  | { readonly kind: 'circle' }
  | { readonly kind: 'pair' }
  | { readonly kind: 'grid' }
  | { readonly kind: 'ring' }
  | { readonly kind: 'share'; readonly by: string };

/**
 * Lanterns take over once anyone lights one: two people get big frames, three or four a 2×2
 * grid, more sit in frames at each seat. One screen share at a time shows in a big card.
 */
export function layoutOf(people: readonly FirePerson[]): Layout {
  const sharing = people.find((p) => p.sharing);
  if (sharing) return { kind: 'share', by: sharing.id };
  if (!people.some((p) => p.lantern)) return { kind: 'circle' };
  if (people.length <= 2) return { kind: 'pair' };
  if (people.length <= 4) return { kind: 'grid' };
  return { kind: 'ring' };
}

/** Names as a list: "Mo, Bea and Otis". */
export function nameList(t: Translate, names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0] ?? '';
  const last = names[names.length - 1] ?? '';
  const head = names.slice(0, -1).reduce((list, name) => t('fire.names.more', { list, name }));
  return t('fire.names.two', { a: head, b: last });
}

export interface HeaderInput {
  readonly phase: 'unlit' | 'joining' | 'room' | 'leaving' | 'quiet';
  readonly farmName: string;
  /** Everyone by the fire, you included once you've sat down. */
  readonly people: readonly FirePerson[];
  readonly nameOf: (id: string) => string;
  readonly layout: Layout;
  readonly captionsOn: boolean;
  /** Someone has flipped their lantern round to show something. */
  readonly showing: string | null;
}

/** The line under "By the fire". */
export function headerLine(t: Translate, h: HeaderInput): string {
  const count = h.people.length;
  const you = h.people.find((p) => p.you) ?? null;
  switch (h.phase) {
    case 'unlit':
      return t('fire.sub.unlit', { farm: h.farmName });
    case 'quiet':
      return t('fire.sub.settling');
    case 'joining':
      return count === 0
        ? t('fire.sub.unlit', { farm: h.farmName })
        : nameList(
            t,
            h.people.filter((p) => !p.you).map((p) => h.nameOf(p.id)),
          );
    case 'leaving':
      return t('fire.sub.count', { count });
    case 'room':
      break;
  }
  if (h.layout.kind === 'share' && you !== null && h.layout.by === you.id)
    return t('fire.sub.sharing');
  if (h.showing !== null) return t('fire.sub.showing', { name: h.nameOf(h.showing) });
  if (h.captionsOn) return t('fire.sub.captions');
  if (h.layout.kind === 'pair' && count === 2 && you !== null) {
    const other = h.people.find((p) => !p.you);
    if (other) return t('fire.sub.pair', { name: h.nameOf(other.id) });
  }
  if (h.layout.kind !== 'circle') return t('fire.sub.count', { count });
  if (count >= DRAWN_SEATS) return t('fire.sub.countWith', { count, state: t('fire.sub.full') });
  const dock = dockStateOf(you);
  if (dock === 'listening')
    return t('fire.sub.countWith', { count, state: t('fire.sub.listening') });
  if (dock === 'muted') return t('fire.sub.countWith', { count, state: t('fire.sub.muted') });
  return t('fire.sub.count', { count });
}

/** The person whose weak connection the panel explains, if anyone's is weak (never yours). */
export const weakOne = (people: readonly FirePerson[]): FirePerson | null =>
  people.find((p) => p.weak && !p.you) ?? null;

/**
 * Who a gesture goes to when you haven't picked anyone: whoever spoke last, else the first
 * person who isn't you.
 */
export function gestureTarget(
  people: readonly FirePerson[],
  picked: string | null,
  lastSpeaker: string | null,
): string | null {
  const others = people.filter((p) => !p.you);
  if (picked !== null && others.some((p) => p.id === picked)) return picked;
  if (lastSpeaker !== null && others.some((p) => p.id === lastSpeaker)) return lastSpeaker;
  return others[0]?.id ?? null;
}
