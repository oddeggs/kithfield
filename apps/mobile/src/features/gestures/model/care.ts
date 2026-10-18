import { isTombstone } from '@kithfield/contracts';

import type { LogEvent } from './message';

const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null && key in payload
    ? (payload as Record<string, unknown>)[key]
    : undefined;

/** A write still in the outbox, as the replica lists it. */
export interface Unsent {
  readonly kind: string;
  readonly payload: unknown;
  readonly acked: boolean;
}

/**
 * Whether you have knocked on this friend's window today (farm time), counting a knock still on
 * its way. One knock per friend per day is a farm rule; this lets the screen say so before trying.
 */
export function knockedToday(input: {
  readonly events: readonly LogEvent[];
  readonly pending: readonly Unsent[];
  readonly me: string;
  readonly to: string;
  readonly today: string;
}): boolean {
  const { events, pending, me, to, today } = input;
  const logged = events.some(
    (e) => e.kind === 'knock' && e.actor === me && e.day === today && field(e.payload, 'to') === to,
  );
  return (
    logged || pending.some((p) => p.kind === 'knock' && !p.acked && field(p.payload, 'to') === to)
  );
}

/**
 * Who has sent warmth to someone since their cloud went up (hugs and umbrellas), by person,
 * oldest first, without you. Names only: never how many.
 */
export function warmthFrom(input: {
  readonly events: readonly LogEvent[];
  readonly to: string;
  readonly since: number;
  readonly me: string;
}): string[] {
  const { events, to, since, me } = input;
  const people: string[] = [];
  for (const e of events) {
    if (e.kind !== 'hug' || e.at < since || e.actor === null || e.actor === me) continue;
    if (isTombstone(e.payload) || field(e.payload, 'to') !== to) continue;
    if (!people.includes(e.actor)) people.push(e.actor);
  }
  return people;
}

/** Whether you have already brought this friend an umbrella since their cloud went up. */
export const umbrellaBrought = (input: {
  readonly events: readonly LogEvent[];
  readonly to: string;
  readonly since: number;
  readonly me: string;
}): boolean =>
  input.events.some(
    (e) =>
      e.kind === 'hug' &&
      e.actor === input.me &&
      e.at >= input.since &&
      field(e.payload, 'to') === input.to &&
      field(e.payload, 'umbrella') === true,
  );

/** A slow post of yours still walking to a friend: it can be recalled until it arrives. */
export interface OnTheWay {
  readonly seq: number;
  readonly deliverAt: number;
}

export function slowPostsOnTheWay(input: {
  readonly events: readonly LogEvent[];
  readonly me: string;
  readonly to: string;
  readonly now: number;
}): OnTheWay[] {
  const { events, me, to, now } = input;
  const recalled = new Set(
    events
      .filter((e) => e.kind === 'unsend')
      .map((e) => field(e.payload, 'target'))
      .filter((t): t is number => typeof t === 'number'),
  );
  return events
    .filter(
      (e) =>
        e.kind === 'slow_post' &&
        e.actor === me &&
        !isTombstone(e.payload) &&
        !recalled.has(e.seq) &&
        field(e.payload, 'to') === to,
    )
    .map((e) => ({ seq: e.seq, deliverAt: Number(field(e.payload, 'deliverAt') ?? 0) }))
    .filter((p) => p.deliverAt > now);
}
