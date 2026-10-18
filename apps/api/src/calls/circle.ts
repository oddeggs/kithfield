import type { PersonId } from '@kithfield/contracts';

/*
 * Who is by a farm's fire, as LiveKit's webhook tells it. LiveKit may deliver its events late,
 * twice or out of order, so each person keeps the time of the last event heard about them and
 * anything older is ignored. Nothing here says how long anyone stayed: it only feeds the
 * `presence` frame and the fire going out.
 */

export type Seat = { readonly room: string; readonly at: number };

export type Circle = {
  /** Everyone in the room now, by identity, with the room session they sat in and when. */
  readonly people: Readonly<Record<string, Seat>>;
  /** When the last event about each identity happened, LiveKit's Unix seconds. */
  readonly seen: Readonly<Record<string, number>>;
};

export const EMPTY_CIRCLE: Circle = { people: {}, seen: {} };

/** A LiveKit event as the circle reads it. */
export type RoomEvent = {
  readonly event: string;
  /** Unix seconds. */
  readonly at: number;
  /** The room session (`room.sid`), empty when LiveKit left it out. */
  readonly room: string;
  readonly identity: string | null;
};

const without = (people: Circle['people'], keep: (seat: Seat) => boolean) =>
  Object.fromEntries(Object.entries(people).filter(([, seat]) => keep(seat)));

/** The circle after one event. Unknown events, and events older than what is known, change nothing. */
export function applyRoomEvent(circle: Circle, e: RoomEvent): Circle {
  switch (e.event) {
    case 'participant_joined':
    case 'participant_left':
    case 'participant_connection_aborted': {
      if (e.identity === null) return circle;
      const last = circle.seen[e.identity];
      if (last !== undefined && e.at < last) return circle;
      const seen = { ...circle.seen, [e.identity]: e.at };
      const { [e.identity]: _gone, ...rest } = circle.people;
      const people =
        e.event === 'participant_joined'
          ? { ...rest, [e.identity]: { room: e.room, at: e.at } }
          : rest;
      return { people, seen };
    }
    case 'room_finished':
      // Everyone in that session has gone home, whatever else is still on its way.
      return {
        people: without(circle.people, (s) => e.room !== '' && s.room !== e.room),
        seen: circle.seen,
      };
    case 'room_started':
      // A new session: anyone still listed from an earlier one, before it started, is gone.
      return {
        people: without(circle.people, (s) => s.room === e.room || s.at >= e.at),
        seen: circle.seen,
      };
    default:
      return circle;
  }
}

/** Who is by the fire, in the order they sat down (then by id), so seats stay put on every phone. */
export const circlePeople = (circle: Circle): PersonId[] =>
  Object.entries(circle.people)
    .sort(([a, sa], [b, sb]) => sa.at - sb.at || (a < b ? -1 : a > b ? 1 : 0))
    .map(([identity]) => identity);

/** Reads a stored circle, or the empty one for anything that isn't one. */
export function circleFrom(stored: unknown): Circle {
  if (typeof stored !== 'object' || stored === null) return EMPTY_CIRCLE;
  const { people, seen } = stored as { people?: unknown; seen?: unknown };
  if (typeof people !== 'object' || people === null) return EMPTY_CIRCLE;
  if (typeof seen !== 'object' || seen === null) return EMPTY_CIRCLE;
  return { people: people as Circle['people'], seen: seen as Circle['seen'] };
}
