import { describe, expect, it } from '@jest/globals';
import { FarmState } from '@kithfield/contracts';

import { bea, fig, pip } from '../../../../../packages/contracts/src/samples.test-data';
import { farmState } from '../../../../../packages/contracts/src/state-samples.test-data';
import { nextPlanDayChange, planDayActivities, planDayChanges, planDayWindow } from './plan-day';

const base = FarmState.parse(farmState);
// Picnic by the river, Saturday 24 October 2026 from 16:00 London time (15:00 UTC).
const START = Date.UTC(2026, 9, 24, 15, 0);
const HOUR = 3_600_000;

const withPlan = (
  rsvps: { person: string; answer: 'in' | 'maybe' | 'out' }[],
  checkins: string[] = [],
) => ({
  farm: base.farm,
  state: {
    ...base,
    seeds: base.seeds.map((s) => (s.seq === 20 ? { ...s, sproutedAt: 1, rsvps, checkins } : s)),
  },
});

describe('the plan’s day activity', () => {
  it('runs from 2 hours before the start to 2 hours after, in the farm’s zone', () => {
    const seed = withPlan([]).state.seeds[0]!;
    expect(planDayWindow(seed, 'Europe/London')).toEqual({
      start: START,
      from: START - 2 * HOUR,
      to: START + 2 * HOUR,
    });
  });

  it('shows for someone going: who is there and who is on the way, with "you"', () => {
    const farm = withPlan(
      [
        { person: bea, answer: 'in' },
        { person: fig, answer: 'in' },
      ],
      [fig],
    );
    const [activity, ...rest] = planDayActivities(
      [farm],
      bea,
      START - HOUR,
      'you',
      'kithfield-dev',
    );
    expect(rest).toEqual([]);
    expect(activity?.key).toBe(`${base.farm}:20`);
    expect(activity?.attributes).toMatchObject({ title: 'Picnic by the river', from: '16:00' });
    expect(activity?.state.here.map((p) => p.person)).toEqual([fig]);
    // The planter is going unless they answered.
    expect(activity?.state.onTheWay.map((p) => [p.person, p.name])).toEqual([
      [pip, 'pip'],
      [bea, 'you'],
    ]);
  });

  it('stays away for someone not going, and outside the window', () => {
    const farm = withPlan([{ person: bea, answer: 'out' }]);
    expect(planDayActivities([farm], bea, START, 'you', 'kithfield')).toEqual([]);
    const going = withPlan([{ person: bea, answer: 'in' }]);
    expect(planDayActivities([going], bea, START - 3 * HOUR, 'you', 'kithfield')).toEqual([]);
    expect(planDayActivities([going], bea, START + 3 * HOUR, 'you', 'kithfield')).toEqual([]);
    expect(nextPlanDayChange([going], START - 3 * HOUR)).toBe(START - 2 * HOUR);
  });

  it('starts what is missing, moves what changed and ends what is over', () => {
    const farm = withPlan([{ person: bea, answer: 'in' }]);
    const [wanted] = planDayActivities([farm], bea, START, 'you', 'kithfield');
    expect(planDayChanges([wanted!], []).start).toEqual([wanted]);
    const same = { id: 'a', key: wanted!.key, stateJson: JSON.stringify(wanted!.state) };
    expect(planDayChanges([wanted!], [same])).toEqual({ start: [], update: [], end: [] });
    expect(planDayChanges([wanted!], [{ ...same, stateJson: '{}' }]).update).toEqual([
      { id: 'a', stateJson: JSON.stringify(wanted!.state) },
    ]);
    expect(planDayChanges([], [same]).end).toEqual(['a']);
  });
});
