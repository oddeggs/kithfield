import { describe, expect, it } from '@jest/globals';

import { canEdit, rowIndexOf, topRoom } from './rows';
import { buildTimeline, type LogEvent } from './timeline';

const T0 = Date.UTC(2026, 9, 15, 18, 0);
const ev = (
  seq: number,
  actor: string,
  kind: string,
  payload: unknown,
  at = T0 + seq * 1000,
): LogEvent => ({
  seq,
  opId: `op-${seq}`,
  at,
  day: '2026-10-15',
  actor,
  kind,
  payload,
  known: true,
});

describe('finding a message in the chat', () => {
  const rows = buildTimeline({
    events: [
      ev(2, 'bea', 'message', { text: 'hi' }),
      ev(3, 'bea', 'message', { tombstone: 'unsent' }),
      ev(4, 'bea', 'unsend', { target: 3, by: 'author' }),
      ev(5, 'pip', 'wave', {}),
    ],
    unsent: [],
    refused: [],
    me: 'me',
    state: null,
    now: T0 + 60_000,
  });

  it('finds bubbles, unsent gaps and lines by seq', () => {
    expect(rows[rowIndexOf(rows, 2)]).toMatchObject({ type: 'bubble', seq: 2 });
    expect(rows[rowIndexOf(rows, 3)]).toMatchObject({ type: 'unsent', seq: 3 });
    expect(rows[rowIndexOf(rows, 5)]).toMatchObject({ type: 'line', seq: 5 });
  });

  it('answers -1 for a message not loaded yet, so the chat keeps paging', () => {
    expect(rowIndexOf(rows, 1)).toBe(-1);
  });
});

describe('editing', () => {
  it('is open for 15 minutes after sending, for your own messages only', () => {
    const mine = { mine: true, seq: 2, at: T0, body: { kind: 'message', text: 'x' } } as const;
    expect(canEdit(mine, T0 + 14 * 60_000)).toBe(true);
    expect(canEdit(mine, T0 + 16 * 60_000)).toBe(false);
    expect(canEdit({ ...mine, mine: false }, T0)).toBe(false);
    expect(canEdit({ ...mine, body: { kind: 'quiet_note', text: 'x' } }, T0)).toBe(false);
  });
});

describe('the room above the oldest row', () => {
  // The farm's header leaves 234 points over the chat, and folds away 86 of them as it scrolls.
  const room = (rows: number, viewport = 800) => topRoom(234, 86, rows, viewport);

  it('is the whole header when the chat fits without scrolling', () => {
    expect(room(300)).toBe(234);
    expect(room(800 - 234)).toBe(234);
  });

  it('is the folded header when the chat scrolls far enough to fold it', () => {
    expect(room(2000)).toBe(234 - 86);
    // Scrolled to its end, the header has folded exactly as far as the room left for it.
    const rows = 800 - (234 - 86) + 86;
    expect(room(rows)).toBe(148);
  });

  it('meets the header part-way when the chat scrolls only a little', () => {
    const rows = 800 - 234 + 40;
    const p = room(rows);
    const scrolled = rows + p - 800;
    expect(p).toBe(234 - scrolled);
    expect(scrolled).toBeGreaterThan(0);
    expect(scrolled).toBeLessThan(86);
  });
});
