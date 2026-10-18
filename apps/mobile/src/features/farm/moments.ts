import type { FarmState, PersonId } from '@kithfield/contracts';

/*
 * The moments the farm shows once when it opens: welcome back after a long while away and
 * a neighbour moving in. Each is decided from the farm as the phone held it before this
 * visit and a flag the phone keeps, so it shows once and never again for the same thing.
 */

/** Away this long, the farm says welcome back. */
export const WELCOME_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Your own move-in is celebrated if you moved in this recently and haven't seen the farm. */
export const OWN_MOVE_IN_MS = 24 * 60 * 60 * 1000;

export type Moment =
  | { readonly kind: 'welcome'; readonly since: number }
  | { readonly kind: 'moveIn'; readonly person: PersonId; readonly upTo: number }
  | { readonly kind: 'none'; readonly upTo: number | null };

export interface MomentFlags {
  /** The last time away that was welcomed back (the `lastOpenedAt` it saw), if any. */
  readonly welcomed: number | null;
  /** The latest move-in already seen (a `joinedAt`), or null on a farm never opened here. */
  readonly joinsSeen: number | null;
}

/**
 * What to show as the farm opens. Welcome back wins over a move-in; on a farm this phone opens
 * for the first time, only your own fresh move-in is celebrated.
 */
export function momentFor(state: FarmState, me: PersonId, now: number, flags: MomentFlags): Moment {
  const self = state.members.find((m) => m.person === me);
  const latestJoin = state.members.reduce((a, m) => Math.max(a, m.joinedAt), 0);
  if (!self) return { kind: 'none', upTo: null };
  if (
    self.lastOpenedAt !== null &&
    now - self.lastOpenedAt >= WELCOME_AFTER_MS &&
    flags.welcomed !== self.lastOpenedAt
  ) {
    return { kind: 'welcome', since: self.lastOpenedAt };
  }
  if (flags.joinsSeen === null) {
    return now - self.joinedAt < OWN_MOVE_IN_MS
      ? { kind: 'moveIn', person: me, upTo: latestJoin }
      : { kind: 'none', upTo: latestJoin };
  }
  const seen = flags.joinsSeen;
  const newcomer = [...state.members]
    .filter((m) => m.joinedAt > seen && m.person !== me)
    .sort((a, b) => b.joinedAt - a.joinedAt)[0];
  return newcomer
    ? { kind: 'moveIn', person: newcomer.person, upTo: latestJoin }
    : { kind: 'none', upTo: latestJoin > seen ? latestJoin : null };
}
