import { FarmEvent, tombstoneOf } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import {
  DAY,
  HOUR,
  MINUTE,
  T0,
  bea,
  critter,
  expectSnapshot,
  fig,
  kit,
  newFarm,
  pip,
  plantOf,
} from './farm.test-data';
import { applyEvent } from './reducer';
import { farmChores } from './seasons';
import { farmView } from './view';

describe('members after tombstones and safety actions', () => {
  it('adds a nameless member when their joining arrives tombstoned', () => {
    const log = newFarm();
    const joined = log.add('joined', kit, {
      name: 'Kit',
      critter: { ...critter, species: 'fox' },
      via: 'invite',
    });
    const before = newFarm().state();
    const nameless = applyEvent(
      before,
      FarmEvent.parse({ ...joined, payload: tombstoneOf(joined, 'author_deleted') }),
    );
    expect(nameless.members.find((m) => m.person === kit)).toMatchObject({
      name: null,
      critter: { species: 'fox' },
      role: 'critter',
      joinedAt: T0,
    });
    expectSnapshot(nameless);
  });

  it('clears the status bubble an unsend targets, and only that one', () => {
    const log = newFarm();
    const first = log.add('status', bea, { status: 'words', text: 'at the allotment' });
    log.add('unsend', null, { target: first.seq, by: 'safety' });
    expect(log.state().members[0]?.status).toBeNull();
    const second = log.add('status', bea, { status: 'words', text: 'home now' });
    log.add('unsend', null, { target: first.seq, by: 'safety' });
    expect(log.state().members[0]?.status).toEqual({
      text: 'home now',
      at: log.at,
      seq: second.seq,
    });
    // A tombstoned bubble arrives cleared; its cloud or battery value stays.
    const cloud = log.add('status', bea, { status: 'cloud', raised: true });
    const state = applyEvent(
      log.state(),
      FarmEvent.parse({ ...second, payload: tombstoneOf(second, 'removed') }),
    );
    expect(state.members[0]?.status).toBeNull();
    const raised = applyEvent(
      newFarm().state(),
      FarmEvent.parse({ ...cloud, payload: tombstoneOf(cloud, 'removed') }),
    );
    expect(raised.members[0]?.cloudAt).toBe(log.at);
  });

  it('applies what the farm writes on a person’s behalf to restore their critter after a removal', () => {
    const log = newFarm();
    const change = log.add('critter_changed', pip, {
      name: 'Rude',
      critter: { ...critter, species: 'owl' },
    });
    log.add('unsend', null, { target: change.seq, by: 'safety' });
    log.add('critter_changed', pip, { name: 'pip', critter });
    expect(log.state().members[1]).toMatchObject({ name: 'pip', critter });
  });

  it('strips a deleted visitor’s gifts from the doorstep of a farm they only visited', () => {
    const log = newFarm();
    const visitor = { name: 'Kit', critter };
    log.add('gate', kit, { visitor, gesture: { gesture: 'firefly', to: bea } });
    log.add('gate', kit, {
      visitor,
      gesture: { gesture: 'gift', gift: 'g_9', to: pip, item: 'jam', wrap: 'kraft' },
    });
    expect(log.state().doorstep).toHaveLength(2);
    log.add('left', kit, { how: 'account_deleted' });
    expect(log.state().doorstep).toEqual([]);
    expect(log.state().former).toEqual([]);
  });

  it('hands the keeper role on when the farm writes it', () => {
    const log = newFarm();
    log.add('left', bea, { how: 'left' });
    log.add('settings_changed', null, { setting: 'role', person: pip, role: 'keeper' });
    expect(log.state().members.map((m) => m.role)).toEqual(['keeper', 'critter']);
  });

  it('wakes a critter on a firefly, which never counts toward shared rain', () => {
    const log = newFarm().wait(6 * DAY);
    const firefly = log.add('firefly', pip, { action: 'left', to: bea });
    log.add('firefly', bea, { action: 'opened', target: firefly.seq });
    const me = log.state().members[0];
    expect(me).toMatchObject({ lastWokenAt: log.at, lastOpenedAt: null });
    expect(farmView(log.state(), log.at).critters[0]?.sleepy).toBe(false);
    log.wait(MINUTE).add('farm_opened', pip, {});
    log.wait(MINUTE).add('farm_opened', fig, {});
    expect(farmChores(log.state(), log.at).sharedRain).toBeNull();
    log.wait(MINUTE).add('farm_opened', bea, {});
    expect(farmChores(log.state(), log.at).sharedRain?.people).toEqual([bea, pip, fig]);
  });
});

describe('the farm day on each event', () => {
  it('counts caps on the day the farm stamped, not this device’s time zone data', () => {
    const log = newFarm();
    log.add('dewdrop', bea, {});
    log.add('dewdrop', bea, {});
    log.add('dewdrop', bea, {});
    // Late in the evening the farm already said it was the next day (its zone, not the device's).
    const late = log.wait(HOUR).add('dewdrop', bea, {});
    const stamped = applyEvent(log.state(), { ...late, seq: late.seq + 1, day: '2026-10-19' });
    expect(stamped.today.day).toBe('2026-10-19');
    expect(plantOf(stamped, 'marigold').dew).toBe(4);
    // A day never steps back, even if a later event carries an earlier one.
    const back = applyEvent(stamped, { ...late, seq: late.seq + 2, day: '2026-10-18' });
    expect(back.today.day).toBe('2026-10-19');
  });
});
