import { isTombstone } from '@kithfield/contracts';

import type { LogEvent, PendingCare } from './message';

const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null && key in payload
    ? (payload as Record<string, unknown>)[key]
    : undefined;

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

/**
 * Whether you have already brought this friend an umbrella since their cloud went up, in the log
 * or still in the outbox: one umbrella is enough.
 */
export const umbrellaBrought = (input: {
  readonly events: readonly LogEvent[];
  readonly pending: readonly PendingCare[];
  readonly to: string;
  readonly since: number;
  readonly me: string;
}): boolean =>
  [
    ...input.events.filter((e) => e.actor === input.me && e.at >= input.since),
    ...input.pending,
  ].some(
    (e) =>
      e.kind === 'hug' &&
      field(e.payload, 'to') === input.to &&
      field(e.payload, 'umbrella') === true,
  );

/** A slow post of yours still walking to a friend: it can be recalled until it arrives. */
export interface OnTheWay {
  readonly seq: number;
  readonly deliverAt: number;
}

/**
 * Your slow posts to a friend that haven't been recalled, oldest first, with when each arrives.
 * Whether one can still be recalled is the farm's rule, asked of the data layer.
 */
export function slowPostsTo(input: {
  readonly events: readonly LogEvent[];
  readonly me: string;
  readonly to: string;
}): OnTheWay[] {
  const { events, me, to } = input;
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
    .map((e) => ({ seq: e.seq, deliverAt: Number(field(e.payload, 'deliverAt') ?? 0) }));
}
