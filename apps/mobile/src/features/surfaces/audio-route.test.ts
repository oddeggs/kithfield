import { describe, expect, it } from '@jest/globals';

import { headsetGone, routeRows } from './audio-route';

const options = [
  { id: 'BT-1', kind: 'bluetooth' as const, name: 'June’s AirPods' },
  { id: 'iphone', kind: 'iphone' as const, name: '' },
  { id: 'speaker', kind: 'speaker' as const, name: '' },
];

describe('where the fire sounds', () => {
  it('lists the headsets, the earpiece, the speaker and AirPlay, marking the one in use', () => {
    const rows = routeRows({
      output: { kind: 'bluetooth', name: 'June’s AirPods' },
      input: { kind: 'bluetooth', name: 'June’s AirPods' },
      options,
    });
    expect(rows.map((r) => [r.id, r.current])).toEqual([
      ['BT-1', true],
      ['iphone', false],
      ['speaker', false],
      ['airplay', false],
    ]);
  });

  it('marks AirPlay with its speaker’s name when the room plays there', () => {
    const rows = routeRows({ output: { kind: 'airplay', name: 'Kitchen' }, input: null, options });
    expect(rows.at(-1)).toEqual({ id: 'airplay', kind: 'airplay', name: 'Kitchen', current: true });
  });

  it('pauses the mic only when a headset goes away', () => {
    const event = {
      output: { kind: 'iphone' as const, name: '' },
      input: null,
      options,
      reason: 'gone',
    };
    expect(headsetGone(event, 'bluetooth')).toBe(true);
    expect(headsetGone(event, 'speaker')).toBe(false);
    expect(headsetGone({ ...event, reason: 'new' }, 'bluetooth')).toBe(false);
  });
});
