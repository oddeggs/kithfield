import { LIMITS } from '@kithfield/contracts';

import { togetherStickers, togetherWith, type TogetherDef } from './catalogue';

/** The most friends one together sticker draws. */
export const MAX_FRIENDS = LIMITS.stickerFriends;

/**
 * Picking friends for a together sticker: a tap adds a friend (the earliest pick makes room once
 * four are in) or takes one out; the last one stays, so there is always someone to draw.
 */
export function togglePick(picked: readonly string[], person: string): string[] {
  if (picked.includes(person)) {
    return picked.length > 1 ? picked.filter((p) => p !== person) : [...picked];
  }
  return [...picked, person].slice(-MAX_FRIENDS);
}

/** Keeps only picks who can still be drawn, in the order they were picked. */
export function keepDrawable(picked: readonly string[], drawable: ReadonlySet<string>): string[] {
  return picked.filter((p) => drawable.has(p));
}

/** One together sticker as offered: which one, and the friends it draws. */
export interface TogetherOffer {
  readonly def: TogetherDef;
  readonly with: readonly string[];
}

/** The big sticker of the friends picked, then the others they can be drawn into. */
export function togetherOffers(picked: readonly string[]): {
  readonly main: TogetherOffer | null;
  readonly more: readonly TogetherOffer[];
} {
  if (picked.length === 0) return { main: null, more: [] };
  const all = togetherStickers();
  const [first, ...rest] = all;
  const offer = (def: TogetherDef): TogetherOffer => ({ def, with: togetherWith(def, picked) });
  const more = ['gang', 'missed', 'tower', 'thanks']
    .map((id) => rest.find((d) => d.id === id))
    .filter((d): d is TogetherDef => d !== undefined)
    .map(offer);
  return { main: first ? offer(first) : null, more };
}

/** Every together sticker with these friends, for the picker's Together tab. */
export function togetherTab(picked: readonly string[]): TogetherOffer[] {
  if (picked.length === 0) return [];
  return togetherStickers().map((def) => ({ def, with: togetherWith(def, picked) }));
}

/**
 * The picker's Together tab: each together sticker with a different friend or two from the farm,
 * so the tab shows the whole farm, not one pairing. Friends in the order they moved in.
 */
export function farmTogether(friends: readonly string[]): TogetherOffer[] {
  if (friends.length === 0) return [];
  const f = (i: number): string => friends[i % friends.length] ?? friends[0] ?? '';
  const many = (from: number, n: number) => [
    ...new Set(Array.from({ length: Math.min(n, friends.length) }, (_, k) => f(from + k))),
  ];
  const picks: Record<string, readonly string[]> = {
    us: [f(0)],
    gang: friends.length > 1 ? many(1, 3) : [f(0)],
    proud: [f(2)],
    our_way: [f(0)],
    missed: [f(3)],
    love: [f(4)],
    tower: many(0, 2),
    thanks: [f(1)],
  };
  return togetherStickers().map((def) => ({ def, with: picks[def.id] ?? [f(0)] }));
}
