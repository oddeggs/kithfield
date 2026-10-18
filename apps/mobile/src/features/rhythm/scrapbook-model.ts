import type { FarmState, LocalDate, ScrapbookPage, Seq, SeedState } from '@kithfield/contracts';
import { hashUnit, planDay, plantFor } from '@kithfield/farm';

import type { StoredEvent } from '../../data';

/* The scrapbook's pages as drawn, and which hangouts are ready to press. */

/** The pressed flowers the art draws (`scene="pressed"`), and the snaps (`scene="snap"`). */
const PRESSED = ['daisy', 'poppy', 'clover', 'lavender', 'fern'] as const;
const SNAPS = ['allotment', 'river', 'picnic', 'garden', 'dusk'] as const;

/** The pressed drawing for a page's flower: the art's own when it has one, else one by seq. */
export function pressedArt(flower: string | null, seq: Seq): string {
  if (flower && (PRESSED as readonly string[]).includes(flower)) return flower;
  return (
    PRESSED[Math.floor(hashUnit(`pressed:${flower ?? ''}:${seq}`) * PRESSED.length)] ?? 'daisy'
  );
}

/** The little snapshot taped to a page, picked by the page so it never changes. */
export function snapArt(seq: Seq): string {
  return SNAPS[Math.floor(hashUnit(`snap:${seq}`) * SNAPS.length)] ?? 'allotment';
}

/** Pages lean a little, alternating, as pages pasted in by hand. */
export function pageTilt(index: number): number {
  const tilts = [-1.2, 1, 0.8, -0.8, 0.6, -1];
  return tilts[index % tilts.length] ?? 0;
}

const KEPT_KINDS = new Set(['media', 'voice', 'message']);

export interface Pressable {
  readonly seed: SeedState;
  readonly day: LocalDate;
  /** What the page keeps: that day's photos, voice notes and messages, by seq, at most 50. */
  readonly items: readonly Seq[];
  /** The flower pressed onto it: what Gatherings grows this season. */
  readonly flower: string;
}

/**
 * Hangouts whose day has come and gone (or is today) and that have no page yet, newest first.
 * The page keeps that day's photos, voice notes and messages from what the phone holds.
 */
export function pressableHangouts(
  state: FarmState,
  pages: readonly Pick<ScrapbookPage, 'seed'>[],
  events: readonly StoredEvent[],
  today: LocalDate,
): readonly Pressable[] {
  const pressed = new Set(pages.map((p) => p.seed).filter((s): s is Seq => s !== null));
  const flower = plantFor('gatherings', state.season.season);
  return state.seeds
    .filter((s) => !s.unsent && s.sproutedAt !== null && !pressed.has(s.seq))
    .flatMap((seed) => {
      const day = planDay(seed);
      if (!day || day > today) return [];
      const items = events
        .filter((e) => e.known && e.day === day && KEPT_KINDS.has(e.kind))
        .map((e) => e.seq)
        .slice(-50);
      return [{ seed, day, items, flower }];
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}
