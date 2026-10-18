import { describe, expect, it } from '@jest/globals';

import {
  foundCount,
  guideRows,
  pageFor,
  seasonsLived,
  sleepyDays,
  stripIndex,
  tileLook,
  entryOf,
} from './guide-model';
import { DAY, T0, autumn, lot, page, summer, viewAt, withPlant } from './guide.test-data';

describe('the seasons a farm has lived', () => {
  it('is none for a farm that began this season', () => {
    expect([...seasonsLived(lot())]).toEqual([]);
  });

  it('counts the seasons since the earliest member joined, up to the one before now', () => {
    // Joined in late May: spring and summer have passed before this autumn.
    const state = { ...lot(), members: lot(T0 - 150 * DAY).members };
    expect([...seasonsLived(state)].sort()).toEqual(['spring', 'summer']);
  });

  it('counts a former member, whose joining started the farm', () => {
    const state = lot();
    const first = state.members[0];
    if (!first) throw new Error('no member');
    const former = [
      { ...first, person: 'p_mo', joinedAt: T0 - 400 * DAY, leftAt: T0, how: 'left' as const },
    ];
    expect(seasonsLived({ ...state, former }).size).toBe(4);
  });
});

describe('a season’s page', () => {
  it('lists the six families in order', () => {
    const rows = guideRows(lot(), viewAt(lot()), 'autumn');
    expect(rows.map((r) => r.family)).toEqual([
      'dew',
      'words',
      'pictures',
      'voices',
      'gestures',
      'gatherings',
    ]);
    expect(rows.map((r) => r.plant)).toEqual([
      'marigold',
      'aster',
      'chrysanthemum',
      'heather',
      'apple',
      'pumpkin',
    ]);
  });

  it('shows a plant found once as found, even in the season growing now', () => {
    const state = { ...lot(), fieldGuide: [page('marigold', { season: 'autumn', year: 2026 })] };
    const rows = guideRows(state, viewAt(state), 'autumn');
    expect(rows[0]?.status.kind).toBe('found');
    expect(foundCount(rows)).toBe(1);
  });

  it('shows this season’s other plants growing, at their stage', () => {
    const state = withPlant(lot(), 'aster', { stage: 2 });
    const aster = guideRows(state, viewAt(state), 'autumn')[1];
    expect(aster?.status).toEqual({ kind: 'growing', stage: 2, sleepy: false });
  });

  it('draws a growing plant napping when its family has been quiet', () => {
    const state = lot();
    const later = viewAt(state, T0 + 9 * DAY);
    expect(guideRows(state, later, 'autumn')[0]?.status).toEqual({
      kind: 'growing',
      stage: 0,
      sleepy: true,
    });
  });

  it('tells a plant resting from a season the farm lived from one still to come', () => {
    const state = { ...lot(), members: lot(T0 - 150 * DAY).members };
    expect(guideRows(state, null, 'summer').every((r) => r.status.kind === 'resting')).toBe(true);
    expect(guideRows(state, null, 'winter').every((r) => r.status.kind === 'notYet')).toBe(true);
  });

  it('finds a plant through a rare page or a trade too', () => {
    const state = {
      ...lot(),
      fieldGuide: [page('lavender', summer, { variant: 'rain_kissed', via: 'traded' as const })],
    };
    expect(guideRows(state, null, 'summer')[3]?.status.kind).toBe('found');
    expect(pageFor(state, 'lavender')?.variant).toBe('rain_kissed');
  });

  it('prefers the plain page over a rare one', () => {
    const state = {
      ...lot(),
      fieldGuide: [page('heather', autumn, { variant: 'frost_lace' }), page('heather', autumn)],
    };
    expect(pageFor(state, 'heather')?.variant).toBeNull();
  });
});

describe('drawing a status', () => {
  it('sketches the bud of a plant still to come, never a lock', () => {
    expect(tileLook({ kind: 'notYet' })).toEqual({ stage: 2, state: '', sketch: true });
  });

  it('draws a resting plant napping in bloom', () => {
    expect(tileLook({ kind: 'resting' })).toEqual({ stage: 3, state: 'sleepy', sketch: false });
  });

  it('outlines the stage a plant is at', () => {
    expect(stripIndex({ kind: 'growing', stage: 1, sleepy: false })).toBe(1);
    expect(stripIndex({ kind: 'growing', stage: 2, sleepy: true })).toBe(5);
    expect(stripIndex({ kind: 'notYet' })).toBeNull();
  });
});

describe('how long a plant waits before it naps', () => {
  it('is a week, and two in winter', () => {
    const lavender = entryOf('lavender');
    const holly = entryOf('holly');
    if (!lavender || !holly) throw new Error('missing plant');
    expect(sleepyDays(lavender, 'autumn')).toBe(7);
    expect(sleepyDays(holly, 'autumn')).toBe(14);
  });

  it('follows the season for the signature crop, and never for the rose', () => {
    const plum = entryOf('plum');
    const rose = entryOf('rose');
    if (!plum || !rose) throw new Error('missing plant');
    expect(sleepyDays(plum, 'winter')).toBe(14);
    expect(sleepyDays(rose, 'winter')).toBeNull();
  });
});
