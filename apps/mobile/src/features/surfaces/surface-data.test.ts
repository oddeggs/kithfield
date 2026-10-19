import { describe, expect, it } from '@jest/globals';
import { FarmState, SurfaceData, type PersonId } from '@kithfield/contracts';

import { at, bea, farm, fig, pip } from '../../../../../packages/contracts/src/samples.test-data';
import { farmState } from '../../../../../packages/contracts/src/state-samples.test-data';
import { targetOf } from './links';
import { tag } from './names';
import {
  fireNow,
  firePeople,
  fireSeen,
  nextPlan,
  surfaceData,
  type CachedEvent,
  type FarmRow,
} from './surface-data';

const state = FarmState.parse(farmState);

const row: FarmRow = {
  farm,
  kind: 'farm',
  name: 'The Thursday Lot',
  with: null,
  land: 'meadow',
  role: 'keeper',
  joinedAt: at - 90 * 86_400_000,
};

const visit: FarmRow = {
  farm: 'v_otis',
  kind: 'visit',
  name: null,
  with: { person: 'p_otis', name: 'Otis', critter: state.members[0]!.critter },
  land: 'meadow',
  role: 'keeper',
  joinedAt: at - 86_400_000,
};

const input = (
  farms: {
    row: FarmRow;
    state: FarmState | null;
    events?: CachedEvent[];
    fire?: readonly PersonId[] | null;
  }[],
) => ({
  farms: farms.map((f) => ({ ...f, events: f.events ?? [], fire: f.fire ?? null })),
  me: bea,
  lang: 'en' as const,
  scheme: 'kithfield-dev',
  now: at,
});

const sprouted = {
  ...state,
  seeds: state.seeds.map((s) => (s.seq === 20 ? { ...s, sproutedAt: at - 1000 } : s)),
};

describe('the surfaces’ data', () => {
  it('is a valid SurfaceData, the newest activity first', () => {
    const data = surfaceData(
      input([
        { row, state, events: [{ at: at - 5000, actor: pip, kind: 'message', payload: {} }] },
        { row: visit, state: null },
      ]),
    );
    expect(SurfaceData.safeParse(data).success).toBe(true);
    expect(data.farms.map((f) => f.farm)).toEqual([farm, 'v_otis']);
  });

  it('draws a farm’s friends, not the person themselves, each opening their card', () => {
    const [surface] = surfaceData(input([{ row, state }])).farms;
    expect(surface?.critters.map((c) => c.person)).toEqual([pip, fig]);
    expect(surface?.critters[0]?.image).toBe(`critter-${tag(pip)}.png`);
    const link = surface?.critters[0]?.link ?? '';
    const params = Object.fromEntries(
      (link.split('?')[1] ?? '').split('&').map((kv) => kv.split('=') as [string, string]),
    );
    expect(targetOf(params)).toEqual({ to: 'critter', farm, person: pip });
  });

  it('names a visit by its friend and keeps both critters', () => {
    const visitState = { ...state, kind: 'visit' as const, name: null };
    const [surface] = surfaceData(input([{ row: visit, state: visitState }])).farms;
    expect(surface?.name).toBeNull();
    expect(surface?.with?.name).toBe('Otis');
    expect(surface?.critters.map((c) => c.person)).toContain(bea);
  });

  it('finds the next sprouted plan with its start and place', () => {
    expect(nextPlan(state, at)).toBeNull();
    expect(nextPlan(sprouted, at)).toEqual({
      seed: 20,
      title: 'Picnic by the river',
      date: '2026-10-24',
      from: '16:00',
      place: 'Willow bend',
    });
    expect(nextPlan(sprouted, Date.UTC(2026, 9, 26))).toBeNull();
  });

  it('names who is by the fire now, from the farm’s presence, friends first and you last', () => {
    const lit = { ...state, fireLitAt: at - 60_000 };
    expect(firePeople(lit, [bea, pip], bea)?.map((p) => p.person)).toEqual([pip, bea]);
    // Pip sat down and went home: only who is there now is named.
    expect(firePeople(lit, [fig], bea)?.map((p) => p.person)).toEqual([fig]);
    expect(firePeople(lit, ['p_stranger'], bea)).toEqual([]);
    // Not known (the farm's socket isn't open and this fire was never seen): nobody is named.
    expect(firePeople(lit, null, bea)).toEqual([]);
    expect(firePeople(state, [pip], bea)).toBeNull();
    const [surface] = surfaceData(input([{ row, state: lit, fire: [bea, fig] }])).farms;
    expect(surface?.fire).toEqual({ litAt: at - 60_000, people: expect.any(Array) });
    expect(surface?.fire?.people.map((p) => p.person)).toEqual([fig, bea]);
  });

  it('keeps who it last saw by the same fire while the farm’s socket is closed', () => {
    const seen = fireSeen(at - 60_000, [pip, bea]);
    expect(fireNow(seen, at - 60_000, null)).toEqual([pip, bea]);
    expect(fireNow(seen, at - 60_000, [bea])).toEqual([bea]);
    // A fire lit again later is a new fire: what was seen by the last one doesn't carry over.
    expect(fireNow(seen, at - 5_000, null)).toBeNull();
    expect(fireNow(seen, null, null)).toBeNull();
    expect(fireSeen(null, [])).toBeUndefined();
  });

  it('takes the season from the farm, or the phone’s clock before it has synced', () => {
    const data = surfaceData(input([{ row, state: null }]));
    expect(data.farms[0]?.season.season).toBe('autumn');
    expect(data.farms[0]?.critters).toEqual([]);
  });
});
