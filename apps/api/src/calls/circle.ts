import type { PersonId } from '@kithfield/contracts';

/*
 * Who is by a farm's fire, as LiveKit's webhook tells it. LiveKit may deliver its events late,
 * twice or out of order, and a phone that reconnects sits down again under a new participant sid
 * before the old one's leave arrives. So each seat keeps the sid that holds it: a leave frees a
 * seat only when it is that sid's, and a join for a sid already heard leaving is ignored. When the
 * webhook and the room disagree, the room's own list (`rebuildCircle`) wins. Nothing here says how
 * long anyone stayed: it only feeds the `presence` frame and the fire going out.
 */

export type Seat = {
  /** The room session (`room.sid`) they sat in. */
  readonly room: string;
  /** The participant sid holding the seat, empty when LiveKit left it out. */
  readonly sid: string;
  /** When they sat down, LiveKit's Unix seconds. */
  readonly at: number;
};

export type Circle = {
  /** Everyone in the room now, by identity. */
  readonly people: Readonly<Record<string, Seat>>;
  /** When the last event about each identity happened, LiveKit's Unix seconds. */
  readonly seen: Readonly<Record<string, number>>;
  /** Participant sids heard leaving, and when, so a late join for one is ignored. */
  readonly gone: Readonly<Record<string, number>>;
};

export const EMPTY_CIRCLE: Circle = { people: {}, seen: {}, gone: {} };

/** A LiveKit event as the circle reads it. */
export type RoomEvent = {
  readonly event: string;
  /** Unix seconds. */
  readonly at: number;
  /** The room session (`room.sid`), empty when LiveKit left it out. */
  readonly room: string;
  readonly identity: string | null;
  /** The participant's sid, empty when LiveKit left it out. */
  readonly sid?: string;
  /** LiveKit's id for the delivery, to act on each event once. */
  readonly id?: string;
};

/** How long a sid heard leaving is remembered: far longer than any webhook is late. */
const GONE_FOR_S = 60 * 60;

const without = (people: Circle['people'], keep: (seat: Seat) => boolean) =>
  Object.fromEntries(Object.entries(people).filter(([, seat]) => keep(seat)));

const pruned = (gone: Circle['gone'], now: number) =>
  Object.fromEntries(Object.entries(gone).filter(([, at]) => at > now - GONE_FOR_S));

/** The circle after one event. Unknown events, and events older than what is known, change nothing. */
export function applyRoomEvent(circle: Circle, e: RoomEvent): Circle {
  const sid = e.sid ?? '';
  switch (e.event) {
    case 'participant_joined': {
      if (e.identity === null) return circle;
      if (sid !== '' && circle.gone[sid] !== undefined) return circle;
      const last = circle.seen[e.identity];
      if (last !== undefined && e.at < last) return circle;
      return {
        people: { ...circle.people, [e.identity]: { room: e.room, sid, at: e.at } },
        seen: { ...circle.seen, [e.identity]: e.at },
        gone: circle.gone,
      };
    }
    case 'participant_left':
    case 'participant_connection_aborted': {
      if (e.identity === null) return circle;
      const gone = sid === '' ? circle.gone : pruned({ ...circle.gone, [sid]: e.at }, e.at);
      const seat = circle.people[e.identity];
      const last = circle.seen[e.identity];
      // A newer connection holds the seat: this is the old one's leave, arriving late.
      const another = seat !== undefined && seat.sid !== '' && sid !== '' && seat.sid !== sid;
      const stale = sid === '' && last !== undefined && e.at < last;
      if (another || stale) return { ...circle, gone };
      const seen = { ...circle.seen, [e.identity]: Math.max(e.at, last ?? 0) };
      const { [e.identity]: _left, ...people } = circle.people;
      return { people, seen, gone };
    }
    case 'room_finished':
      // Everyone in that session has gone home, whatever else is still on its way.
      return {
        ...circle,
        people: without(circle.people, (s) => e.room !== '' && s.room !== e.room),
      };
    case 'room_started':
      // A new session: anyone still listed from an earlier one, before it started, is gone.
      return {
        ...circle,
        people: without(circle.people, (s) => s.room === e.room || s.at >= e.at),
      };
    default:
      return circle;
  }
}

/** Someone the room itself lists, as `ListParticipants` answers. */
export type Listed = { readonly identity: string; readonly sid: string; readonly at: number };

/** The circle as the room lists it now: who is really there, keeping what was known about events. */
export function rebuildCircle(circle: Circle, listed: readonly Listed[]): Circle {
  const people: Record<string, Seat> = {};
  for (const p of listed) {
    const room = circle.people[p.identity]?.room ?? '';
    people[p.identity] = { room, sid: p.sid, at: p.at };
  }
  return { ...circle, people };
}

/** Who is by the fire, in the order they sat down (then by id), so seats stay put on every phone. */
export const circlePeople = (circle: Circle): PersonId[] =>
  Object.entries(circle.people)
    .sort(([a, sa], [b, sb]) => sa.at - sb.at || (a < b ? -1 : a > b ? 1 : 0))
    .map(([identity]) => identity);

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Reads a stored circle, or the empty one for anything that isn't one. */
export function circleFrom(stored: unknown): Circle {
  if (!record(stored)) return EMPTY_CIRCLE;
  const { people, seen, gone } = stored;
  if (!record(people) || !record(seen)) return EMPTY_CIRCLE;
  const seats: Record<string, Seat> = {};
  for (const [id, s] of Object.entries(people)) {
    if (!record(s)) continue;
    seats[id] = {
      room: typeof s['room'] === 'string' ? s['room'] : '',
      sid: typeof s['sid'] === 'string' ? s['sid'] : '',
      at: typeof s['at'] === 'number' ? s['at'] : 0,
    };
  }
  return {
    people: seats,
    seen: seen as Circle['seen'],
    gone: record(gone) ? (gone as Circle['gone']) : {},
  };
}
