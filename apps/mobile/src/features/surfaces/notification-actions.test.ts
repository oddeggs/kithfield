import { describe, expect, it } from '@jest/globals';

import { OpId } from '@kithfield/contracts';

import { categories, DEFAULT_ACTION, readResponse, responseOpId } from './notification-actions';

const opId = () => '01890000-0000-7000-8000-000000000001';
const plan = { farm: 'f_lot', seq: 40, kind: 'seed_planted', push: 'p1', seed: 40 };
const mention = { farm: 'f_lot', seq: 52, kind: 'message', push: 'p2' };

describe('answering a push from the lock screen', () => {
  it('offers I’m in, Can’t this time and a dewdrop on a plan; only the dewdrop elsewhere', () => {
    const set = categories((a) => a.toUpperCase());
    expect(set.map((c) => [c.identifier, c.actions.map((a) => a.identifier)])).toEqual([
      ['plan', ['im_in', 'cant', 'dewdrop']],
      ['tend', ['dewdrop']],
    ]);
    expect(set.every((c) => c.actions.every((a) => !a.options.opensAppToForeground))).toBe(true);
  });

  it('says yes or no to the plan', () => {
    expect(readResponse('im_in', 'plan', plan, opId)).toEqual({
      kind: 'command',
      farm: 'f_lot',
      command: { opId: opId(), kind: 'rsvp', payload: { seed: 40, answer: 'in' } },
    });
    expect(readResponse('cant', 'plan', plan, opId)).toMatchObject({
      command: { kind: 'rsvp', payload: { seed: 40, answer: 'out' } },
    });
  });

  it('leaves a dewdrop on the farm for a plan, or on the message the push was about', () => {
    const toFarm = readResponse('dewdrop', 'plan', plan, opId);
    expect(toFarm.kind === 'command' && toFarm.command).toEqual({
      opId: opId(),
      kind: 'dewdrop',
      payload: {},
    });
    expect(readResponse('dewdrop', 'tend', mention, opId)).toMatchObject({
      farm: 'f_lot',
      command: { kind: 'dewdrop', payload: { target: 52 } },
    });
  });

  it('reads the data Expo wraps in a JSON body', () => {
    expect(readResponse('dewdrop', 'tend', { body: JSON.stringify(mention) }, opId)).toMatchObject({
      kind: 'command',
    });
  });

  it('refuses an action the category doesn’t offer, or a push it can’t place', () => {
    expect(readResponse('im_in', 'tend', mention, opId)).toEqual({ kind: 'none' });
    expect(readResponse('dewdrop', null, mention, opId)).toEqual({ kind: 'none' });
    expect(readResponse('dewdrop', 'tend', { nope: 1 }, opId)).toEqual({ kind: 'none' });
  });

  it('opens the plan or the farm on a plain tap', () => {
    expect(readResponse(DEFAULT_ACTION, 'plan', plan, opId)).toEqual({
      kind: 'open',
      target: { to: 'plan', farm: 'f_lot', seed: 40 },
      push: 'p1',
    });
    expect(readResponse(DEFAULT_ACTION, null, mention, opId)).toMatchObject({
      target: { to: 'farm', farm: 'f_lot' },
    });
  });

  it('opens the asks about together stickers for a friend’s ask', () => {
    const ask = { farm: 'f_lot', seq: null, kind: 'together_ask', push: 'p3' };
    expect(readResponse(DEFAULT_ACTION, null, ask, opId)).toEqual({
      kind: 'open',
      target: { to: 'stickerAsks' },
      push: 'p3',
    });
  });
});

describe('an answer’s op id', () => {
  it('is a UUIDv7, the same for the same tap and different for another', () => {
    const one = responseOpId('req-1', 'dewdrop', 1_792_000_000_000);
    expect(OpId.safeParse(one).success).toBe(true);
    expect(responseOpId('req-1', 'dewdrop', 1_792_000_000_000)).toBe(one);
    expect(responseOpId('req-1', 'im_in', 1_792_000_000_000)).not.toBe(one);
    expect(responseOpId('req-2', 'dewdrop', 1_792_000_000_000)).not.toBe(one);
  });
});
