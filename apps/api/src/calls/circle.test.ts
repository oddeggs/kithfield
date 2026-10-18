import { describe, expect, it } from 'vitest';

import { applyRoomEvent, circlePeople, EMPTY_CIRCLE, type RoomEvent } from './circle';

const ev = (event: string, at: number, identity: string | null, room = 'RM_a'): RoomEvent => ({
  event,
  at,
  room,
  identity,
});

const run = (...events: RoomEvent[]) => events.reduce(applyRoomEvent, EMPTY_CIRCLE);

describe('who is by the fire', () => {
  it('lists people in the order they sat down, and drops whoever heads home', () => {
    const circle = run(
      ev('participant_joined', 10, 'bea'),
      ev('participant_joined', 12, 'pip'),
      ev('participant_joined', 11, 'mo'),
      ev('participant_left', 13, 'mo'),
    );
    expect(circlePeople(circle)).toEqual(['bea', 'pip']);
  });

  it('ignores an event older than the last one heard about that person', () => {
    // The leave arrives first; the join it follows is late and must not seat them again.
    const circle = run(ev('participant_left', 20, 'bea'), ev('participant_joined', 18, 'bea'));
    expect(circlePeople(circle)).toEqual([]);
  });

  it('takes the same event twice as once', () => {
    const joined = ev('participant_joined', 5, 'fig');
    expect(circlePeople(run(joined, joined))).toEqual(['fig']);
  });

  it('counts a dropped connection as heading home', () => {
    const circle = run(
      ev('participant_joined', 1, 'otis'),
      ev('participant_connection_aborted', 2, 'otis'),
    );
    expect(circlePeople(circle)).toEqual([]);
  });

  it('empties the circle when its room closes, but not for an older session closing late', () => {
    const now = run(ev('participant_joined', 30, 'bea', 'RM_b'));
    expect(circlePeople(applyRoomEvent(now, ev('room_finished', 31, null, 'RM_a')))).toEqual([
      'bea',
    ]);
    expect(circlePeople(applyRoomEvent(now, ev('room_finished', 31, null, 'RM_b')))).toEqual([]);
  });

  it('forgets people left over from an earlier session when a new one starts', () => {
    const circle = run(
      ev('participant_joined', 1, 'mo', 'RM_old'),
      ev('participant_joined', 41, 'pip', 'RM_new'),
      ev('room_started', 40, null, 'RM_new'),
    );
    expect(circlePeople(circle)).toEqual(['pip']);
  });

  it('leaves events it doesn’t know alone', () => {
    const circle = run(ev('participant_joined', 1, 'bea'));
    expect(applyRoomEvent(circle, ev('track_published', 2, 'bea'))).toBe(circle);
  });
});
