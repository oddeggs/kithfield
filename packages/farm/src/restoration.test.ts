import { describe, expect, it } from 'vitest';

import { RESTORATION_PROJECTS } from './catalog';
import { DAY, HOUR, bea, expectSnapshot, fig, newFarm, pip } from './farm.test-data';
import { applyEvent, replay } from './reducer';
import { restorationNight, restorationView, startRestoration } from './restoration';
import { RESTORATION_RULES_VERSION, RULES_VERSION } from './rules';
import { farmView } from './view';

const greenhouse = RESTORATION_PROJECTS[0];

describe('the restoration project', () => {
  it('starts the first project on a farm made under these rules, and never on a visit', () => {
    expect(RULES_VERSION).toBeGreaterThanOrEqual(RESTORATION_RULES_VERSION);
    const state = newFarm().state();
    expect(state.restoration).toEqual({
      project: greenhouse.id,
      step: 0,
      steppedOn: '2026-10-18',
      tendedOn: null,
      done: [],
    });
    expectSnapshot(state);
    expect(newFarm({ kind: 'visit' }).state().restoration).toBeUndefined();
  });

  it('reveals one step a night after any tend, however much care there was', () => {
    const log = newFarm();
    for (let i = 0; i < 6; i++) log.add('dewdrop', pip, {});
    log.add('wave', fig, { to: bea });
    expect(log.state().restoration?.step).toBe(0);
    expect(log.state().restoration?.tendedOn).toBe('2026-10-18');
    // The next day's first event reveals the step, whatever kind it is.
    log.wait(DAY);
    log.add('farm_opened', bea, {});
    expect(log.state().restoration).toMatchObject({ step: 1, steppedOn: '2026-10-19' });
  });

  it('takes no step after a day nobody tended', () => {
    const log = newFarm();
    log.wait(DAY);
    log.add('farm_opened', bea, {});
    log.wait(DAY);
    log.add('farm_opened', pip, {});
    expect(log.state().restoration).toMatchObject({ step: 0, tendedOn: null });
    // Days without care in between don't lose the step a tend earned.
    log.add('message', pip, { text: 'morning' });
    log.wait(3 * DAY);
    log.add('farm_opened', fig, {});
    expect(log.state().restoration).toMatchObject({ step: 1, steppedOn: '2026-10-23' });
  });

  it('counts a hangout and shared rain as tending', () => {
    const log = newFarm();
    log.add('shared_rain', null, { day: '2026-10-18', people: [bea, pip, fig] });
    expect(log.state().restoration?.tendedOn).toBe('2026-10-18');
  });

  it('finishes the project on its last step and keeps it among the done', () => {
    const log = newFarm();
    for (let night = 0; night < greenhouse.steps; night++) {
      log.add('dewdrop', pip, {});
      log.wait(DAY);
    }
    log.add('farm_opened', bea, {});
    const r = log.state().restoration;
    expect(r?.step).toBe(greenhouse.steps);
    expect(r?.done).toEqual([{ project: greenhouse.id, finishedOn: r?.steppedOn }]);
    // Steps only rise: more care adds nothing past the last.
    log.add('dewdrop', pip, {});
    log.wait(DAY);
    log.add('farm_opened', bea, {});
    expect(log.state().restoration?.step).toBe(greenhouse.steps);
  });

  it('starts the next project the day after one finishes', () => {
    const finished = {
      project: 'greenhouse',
      step: greenhouse.steps,
      steppedOn: '2026-11-14',
      tendedOn: '2026-11-13',
      done: [{ project: 'greenhouse', finishedOn: '2026-11-14' }],
    };
    const two = [greenhouse, { id: 'well', steps: 3 }];
    expect(restorationNight(finished, '2026-11-14', two)).toEqual(finished);
    expect(restorationNight(finished, '2026-11-15', two)).toEqual({
      ...finished,
      project: 'well',
      step: 0,
      steppedOn: '2026-11-15',
      tendedOn: null,
    });
    // With no project after it in the catalogue, the finished one stays.
    expect(restorationNight(finished, '2026-11-15')).toEqual(finished);
  });

  it('starts at the move to the new rules on an older farm', () => {
    const log = newFarm();
    const older = log.events.map((e) => ({ ...e, rulesVersion: RESTORATION_RULES_VERSION - 1 }));
    const before = replay(older);
    expect(before?.restoration).toBeUndefined();
    log.wait(2 * HOUR);
    const moved = applyEvent(before ?? log.state(), {
      seq: older.length + 1,
      opId: '0192f1e2-3b4c-7d5e-8f60-0000000000aa',
      at: log.at,
      day: '2026-10-18',
      rulesVersion: RESTORATION_RULES_VERSION - 1,
      actor: null,
      kind: 'rules_changed',
      payload: { from: RESTORATION_RULES_VERSION - 1, to: RESTORATION_RULES_VERSION },
    });
    expect(moved.rulesVersion).toBe(RESTORATION_RULES_VERSION);
    expect(moved.restoration).toEqual(startRestoration('2026-10-18'));
    expectSnapshot(moved);
  });

  it('shows the night’s step from the morning, before the day’s first event', () => {
    const log = newFarm();
    log.add('dewdrop', pip, {});
    const state = log.state();
    const tonight = farmView(state, log.at).restoration;
    expect(tonight).toMatchObject({ step: 0, stepsTonight: true });
    expect(tonight?.progressTonight).toBeCloseTo(1 / greenhouse.steps);
    const morning = farmView(state, log.at + DAY).restoration;
    expect(morning).toMatchObject({ step: 1, stepsTonight: false, scene: greenhouse.scene });
    // The view and the reducer agree once the event lands.
    log.wait(DAY);
    log.add('farm_opened', bea, {});
    expect(restorationView(log.state(), '2026-10-19')).toEqual(morning);
  });

  it('is deterministic: the same log gives the same project on every device', () => {
    const log = newFarm();
    for (let i = 0; i < 10; i++) {
      log.add(i % 2 ? 'dewdrop' : 'message', i % 3 ? pip : fig, i % 2 ? {} : { text: 'hi' });
      log.wait(i % 3 ? DAY : 6 * HOUR);
    }
    expect(replay(log.events)).toEqual(
      replay(JSON.parse(JSON.stringify(log.events)) as typeof log.events),
    );
  });
});

describe('the farm switching a theme on', () => {
  it('takes a farm-written theme on rules that allow it, as a keeper’s', () => {
    const log = newFarm();
    log.add('settings_changed', null, { setting: 'theme', theme: 'lanterns' });
    expect(log.state().theme).toBe('lanterns');
    log.add('settings_changed', bea, { setting: 'theme', theme: null });
    expect(log.state().theme).toBeNull();
  });

  it('ignores one on a farm still on older rules', () => {
    const log = newFarm();
    log.add('settings_changed', null, { setting: 'theme', theme: 'lanterns' });
    const older = log.events.map((e) => ({ ...e, rulesVersion: RESTORATION_RULES_VERSION - 1 }));
    expect(replay(older)?.theme).toBeNull();
  });
});

describe('a chip-in gift', () => {
  it('lands on the doorstep and grows Gestures like any gift, credited to its actor only', () => {
    const log = newFarm({ members: [bea, pip, fig, 'p_kit'] });
    log.add('gift', pip, {
      action: 'given',
      gift: 'g_1',
      to: bea,
      item: 'kf.item.scarf',
      wrap: 'kraft',
      chipIn: 'c_1',
      with: [fig, 'p_kit'],
    });
    const state = log.state();
    expect(state.doorstep).toMatchObject([{ kind: 'gift', from: pip, to: bea, gift: 'g_1' }]);
    const apple = state.plants.find((p) => p.plant === 'apple');
    expect(apple?.credits).toEqual([{ person: pip, kinds: ['gift'] }]);
    expect(apple?.dew).toBe(2);
    expect(state.members.find((m) => m.person === fig)?.lastTendedAt).toBeNull();
  });
});
