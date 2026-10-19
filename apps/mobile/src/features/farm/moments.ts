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
  /**
   * When the person was last here before this visit, when the farm's own `lastOpenedAt` is this
   * visit already (a fresh install's first snapshot carries it): null when it can't be known.
   */
  readonly lastVisit?: number | null;
}

/** The person's latest `farm_opened` in the log before `before`, if the phone holds one. */
export function visitBefore(
  events: readonly { readonly kind: string; readonly actor: string | null; readonly at: number }[],
  me: PersonId,
  before: number,
): number | null {
  let latest: number | null = null;
  for (const e of events) {
    if (e.kind === 'farm_opened' && e.actor === me && e.at < before) {
      latest = latest === null ? e.at : Math.max(latest, e.at);
    }
  }
  return latest;
}

/**
 * What to show as the farm opens. Welcome back wins over a move-in; on a farm this phone opens
 * for the first time, only your own fresh move-in is celebrated.
 */
export function momentFor(state: FarmState, me: PersonId, now: number, flags: MomentFlags): Moment {
  const self = state.members.find((m) => m.person === me);
  const latestJoin = state.members.reduce((a, m) => Math.max(a, m.joinedAt), 0);
  if (!self) return { kind: 'none', upTo: null };
  const last = flags.lastVisit === undefined ? self.lastOpenedAt : flags.lastVisit;
  if (last !== null && now - last >= WELCOME_AFTER_MS && flags.welcomed !== last) {
    return { kind: 'welcome', since: last };
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

/**
 * A wave from a farm moment ("say hi", "wave hello"): on to the chat once it is queued. A wave
 * the farm's rules refuse stays on the moment, where `send` has said why.
 */
export async function waveThenGo(send: () => Promise<boolean>, go: () => void): Promise<boolean> {
  const sent = await send();
  if (sent) go();
  return sent;
}
