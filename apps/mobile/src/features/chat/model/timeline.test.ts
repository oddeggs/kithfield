import { describe, expect, it } from '@jest/globals';

import { buildTimeline, LONG_NAP_MS, type LogEvent, type TimelineItem } from './timeline';

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 15, 18, 0);
let n = 0;
const ev = (
  seq: number,
  actor: string | null,
  kind: string,
  payload: unknown,
  at = T0 + seq * 1000,
): LogEvent => ({
  seq,
  opId: `op-${seq}-${(n += 1)}`,
  at,
  day: new Date(at).toISOString().slice(0, 10),
  actor,
  kind,
  payload,
  known: true,
});

const bubbles = (items: TimelineItem[]) => items.filter((i) => i.type === 'bubble');

describe('the chat timeline', () => {
  const base = { unsent: [], refused: [], me: 'me', state: null, now: T0 + 10 * HOUR };

  it('applies the latest edit and marks the bubble edited', () => {
    const items = buildTimeline({
      ...base,
      events: [
        ev(2, 'bea', 'message', { text: 'helo' }),
        ev(3, 'bea', 'edit', { target: 2, text: 'hello' }),
        ev(4, 'bea', 'edit', { target: 2, text: 'hello!' }),
      ],
    });
    const [b] = bubbles(items);
    expect(b).toMatchObject({ body: { kind: 'message', text: 'hello!' }, edited: true });
  });

  it('leaves a quiet gap where a message was unsent, by its author or the safety team', () => {
    const items = buildTimeline({
      ...base,
      events: [
        ev(2, 'bea', 'message', { tombstone: 'unsent' }),
        ev(3, 'bea', 'unsend', { target: 2, by: 'author' }),
        ev(4, 'pip', 'message', { text: 'still here' }),
        ev(5, null, 'unsend', { target: 4, by: 'safety' }),
      ],
    });
    const gaps = items.filter((i) => i.type === 'unsent');
    expect(gaps).toMatchObject([
      { seq: 2, actor: 'bea', by: 'author' },
      { seq: 4, actor: 'pip', by: 'safety' },
    ]);
    expect(bubbles(items)).toHaveLength(0);
  });

  it('gathers dewdrops under their message, and drops one taken back', () => {
    const items = buildTimeline({
      ...base,
      events: [
        ev(2, 'bea', 'message', { text: 'photo soon' }),
        ev(3, 'pip', 'dewdrop', { target: 2 }),
        ev(4, 'me', 'dewdrop', { target: 2 }),
        ev(5, 'fig', 'dewdrop', { target: 2 }),
        ev(6, 'fig', 'unsend', { target: 5, by: 'author' }),
      ],
    });
    const [b] = bubbles(items);
    expect(b).toMatchObject({ dew: ['pip', 'me'], myDew: 4 });
  });

  it('keeps one reaction per person, and lets them take it back', () => {
    const items = buildTimeline({
      ...base,
      events: [
        ev(2, 'bea', 'message', { text: 'sun!' }),
        ev(3, 'pip', 'reaction', { target: 2, reaction: 'heart' }),
        ev(4, 'pip', 'reaction', { target: 2, reaction: 'sun' }),
        ev(5, 'fig', 'reaction', { target: 2, reaction: 'sun' }),
        ev(6, 'mo', 'reaction', { target: 2, reaction: 'heart' }),
        ev(7, 'mo', 'reaction', { target: 2, reaction: null }),
      ],
    });
    expect(bubbles(items)[0]).toMatchObject({
      reactions: [{ reaction: 'sun', people: ['pip', 'fig'] }],
    });
  });

  it('draws unsent writes as sending, acked ones as sent and refused ones as failed', () => {
    const items = buildTimeline({
      ...base,
      events: [ev(2, 'me', 'message', { text: 'landed' })],
      unsent: [
        {
          opId: 'a',
          kind: 'message',
          payload: { text: 'on its way' },
          createdAt: T0 + 5000,
          acked: false,
        },
        {
          opId: 'b',
          kind: 'message',
          payload: { text: 'accepted' },
          createdAt: T0 + 6000,
          acked: true,
        },
      ],
      refused: [
        {
          opId: 'c',
          farm: 'f',
          kind: 'message',
          payload: { text: 'no' },
          reason: 'paused',
          at: T0 + 7000,
        },
      ],
    });
    expect(bubbles(items).map((b) => b.type === 'bubble' && [b.delivery, b.mine])).toEqual([
      ['sent', true],
      ['sending', true],
      ['sent', true],
      ['failed', true],
    ]);
  });

  it('never draws a write twice once its event has landed', () => {
    const landed = ev(2, 'me', 'message', { text: 'hi' });
    const items = buildTimeline({
      ...base,
      events: [landed],
      unsent: [
        { opId: landed.opId, kind: 'message', payload: { text: 'hi' }, createdAt: T0, acked: true },
      ],
    });
    expect(bubbles(items)).toHaveLength(1);
  });

  it('starts each farm day with a divider', () => {
    const items = buildTimeline({
      ...base,
      events: [
        ev(2, 'bea', 'message', { text: 'one' }, T0),
        ev(3, 'bea', 'message', { text: 'two' }, T0 + HOUR),
        ev(4, 'bea', 'message', { text: 'three' }, T0 + 24 * HOUR),
      ],
    });
    expect(items.map((i) => i.type)).toEqual(['day', 'bubble', 'bubble', 'day', 'bubble']);
  });

  it('welcomes a friend back from a long nap, but not after a short one', () => {
    const items = buildTimeline({
      ...base,
      events: [
        ev(2, 'otis', 'farm_opened', {}, T0),
        ev(3, 'otis', 'farm_opened', {}, T0 + HOUR),
        ev(4, 'otis', 'farm_opened', {}, T0 + HOUR + LONG_NAP_MS),
      ],
    });
    expect(items.filter((i) => i.type === 'back')).toMatchObject([{ seq: 4, actor: 'otis' }]);
  });

  it('keeps a slow post sealed until it arrives, then reads it as a quiet note', () => {
    const sealed = buildTimeline({
      ...base,
      events: [
        ev(2, 'me', 'slow_post', {
          to: 'bea',
          text: 'x',
          when: 'morning',
          deliverAt: T0 + 20 * HOUR,
        }),
      ],
    });
    expect(sealed).toMatchObject([{ type: 'day' }, { type: 'line', kind: 'slow_post', to: 'bea' }]);
    const arrived = buildTimeline({
      ...base,
      now: T0 + 30 * HOUR,
      events: [
        ev(2, 'bea', 'slow_post', {
          to: 'me',
          text: 'morning!',
          when: 'morning',
          deliverAt: T0 + 20 * HOUR,
        }),
      ],
    });
    expect(bubbles(arrived)[0]).toMatchObject({ body: { kind: 'quiet_note', text: 'morning!' } });
  });

  it('shows gestures as lines and a farm dewdrop as a line, but a message dewdrop under it', () => {
    const items = buildTimeline({
      ...base,
      events: [
        ev(2, 'pip', 'firefly', { action: 'left', to: 'me' }),
        ev(3, 'pip', 'dewdrop', {}),
        ev(4, 'pip', 'wave', {}),
      ],
    });
    expect(items.filter((i) => i.type === 'line').map((i) => i.type === 'line' && i.kind)).toEqual([
      'firefly',
      'dewdrop',
      'wave',
    ]);
  });

  it('says arrivals in a row on one line, and leaves them off a visit', () => {
    const events = [
      ev(2, 'bea', 'joined', {}),
      ev(3, 'fig', 'joined', {}),
      ev(4, 'pip', 'joined', {}),
    ];
    expect(buildTimeline({ ...base, events }).filter((i) => i.type === 'line')).toMatchObject([
      { kind: 'joined', actor: 'bea', with: ['fig', 'pip'] },
    ]);
    const visit = { kind: 'visit', members: [], pins: [], aliases: {} } as never;
    expect(
      buildTimeline({ ...base, state: visit, events }).filter((i) => i.type === 'line'),
    ).toEqual([]);
  });
});
