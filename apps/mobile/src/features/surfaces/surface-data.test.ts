import { describe, expect, it } from '@jest/globals';
import { FarmState, SurfaceData } from '@kithfield/contracts';

import { at, bea, farm, fig, pip } from '../../../../../packages/contracts/src/samples.test-data';
import { farmState } from '../../../../../packages/contracts/src/state-samples.test-data';
import { targetOf } from './links';
import { tag } from './names';
import { firePeople, nextPlan, surfaceData, type CachedEvent, type FarmRow } from './surface-data';

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

const input = (farms: { row: FarmRow; state: FarmState | null; events?: CachedEvent[] }[]) => ({
  farms: farms.map((f) => ({ ...f, events: f.events ?? [] })),
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

  it('puts by the fire whoever lit it or sat down since, until it goes out', () => {
    const lit = { ...state, fireLitAt: at - 60_000 };
    const fire = (actor: string, s: string, when: number): CachedEvent => ({
      at: when,
      actor,
      kind: 'fire',
      payload: { state: s },
    });
    const events = [
      fire(fig, 'sat', at - 120_000),
      fire(pip, 'lit', at - 60_000),
      fire(bea, 'sat', at - 30_000),
      fire(pip, 'sat', at - 20_000),
    ];
    expect(firePeople(lit, events)?.map((p) => p.person)).toEqual([pip, bea]);
    expect(firePeople(state, events)).toBeNull();
    const [surface] = surfaceData(input([{ row, state: lit, events }])).farms;
    expect(surface?.fire).toEqual({ litAt: at - 60_000, people: expect.any(Array) });
    expect(surface?.fire?.people.map((p) => p.name)).toEqual(['pip', 'bea']);
  });

  it('takes the season from the farm, or the phone’s clock before it has synced', () => {
    const data = surfaceData(input([{ row, state: null }]));
    expect(data.farms[0]?.season.season).toBe('autumn');
    expect(data.farms[0]?.critters).toEqual([]);
  });
});
