import type { FarmState } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import { aliasOf, withAliases } from './aliases';
import { DAY, T0, bea, expectSnapshot, fig, newFarm, pip } from './farm.test-data';
import { applyEvent, reduce } from './reducer';
import { farmView } from './view';

/** An install that was signed in anonymously, then merged into Pip. */
const anon = 'p_anon_pip';

/** The farm as the farm object leaves it after the merge: Pip in Anon's place, and the alias. */
const merged = (state: FarmState): FarmState => ({ ...state, aliases: { [anon]: pip } });

describe('person aliases', () => {
  it('reads a merged-away id as the kept person, and anyone else as themselves', () => {
    const state = merged(newFarm().state());
    expect(aliasOf(state, anon)).toBe(pip);
    expect(aliasOf(state, bea)).toBe(bea);
    expectSnapshot(state);
  });

  it('leaves an event untouched when nobody it names was merged away', () => {
    const log = newFarm();
    const dew = log.add('dewdrop', bea, { to: fig });
    expect(withAliases(merged(log.state()), dew)).toBe(dew);
    expect(withAliases(log.state(), dew)).toBe(dew);
  });

  it('maps the actor and the people a payload or a tombstone names', () => {
    const log = newFarm();
    const firefly = log.add('firefly', anon, { action: 'left', to: bea });
    const rain = log.add('shared_rain', null, { day: '2026-10-18', people: [bea, anon, fig] });
    const tombstoned = { ...firefly, payload: { tombstone: 'unsent', facts: { to: anon } } };
    const state = merged(log.state());
    expect(withAliases(state, firefly)).toMatchObject({ actor: pip, payload: { to: bea } });
    expect(withAliases(state, rain).payload).toEqual({
      day: '2026-10-18',
      people: [bea, pip, fig],
    });
    expect(withAliases(state, tombstoned as typeof firefly).payload).toEqual({
      tombstone: 'unsent',
      facts: { to: pip },
    });
  });

  it('credits a merged-away author’s care and gestures to the kept person', () => {
    const log = newFarm();
    const before = merged(log.state());
    const events = [
      log.add('dewdrop', anon, {}),
      log.add('firefly', anon, { action: 'left', to: bea }),
      log.add('firefly', fig, { action: 'left', to: anon }),
    ];
    const after = reduce(before, events);
    expect(after.today.given.map((g) => g.person)).toContain(pip);
    expect(after.today.given.map((g) => g.person)).not.toContain(anon);
    expect(after.doorstep.map((d) => [d.from, d.to])).toEqual([
      [pip, bea],
      [fig, pip],
    ]);
    expectSnapshot(after);
  });

  it('applies the same events the same way whether the author was merged or always the kept person', () => {
    const asAnon = newFarm();
    const asPip = newFarm();
    const left = (log: typeof asAnon, who: string) => [
      log.add('dewdrop', who, {}),
      log.add('firefly', who, { action: 'left', to: bea }),
    ];
    const merges = reduce(merged(asAnon.state()), left(asAnon, anon));
    const plain = reduce(merged(asPip.state()), left(asPip, pip));
    expect(merges).toEqual(plain);
  });

  it('draws people on the doorstep and at roses as who they are now', () => {
    const log = newFarm();
    log.add('firefly', fig, { action: 'left', to: bea });
    const state = log.state();
    const [item] = state.doorstep;
    if (item === undefined) throw new Error('No firefly on the step');
    const old: FarmState = merged({ ...state, doorstep: [{ ...item, from: anon }] });
    expect(farmView(old, T0 + DAY).doorstep.map((d) => d.from)).toEqual([pip]);
    const next = applyEvent(old, log.add('farm_opened', anon, {}));
    expect(next.members.find((m) => m.person === pip)?.lastOpenedAt).toBe(log.at);
  });
});
