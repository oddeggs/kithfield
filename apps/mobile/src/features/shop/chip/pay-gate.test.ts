import { describe, expect, it } from '@jest/globals';
import type { ChipIn } from '@kithfield/contracts';

import { payGate } from './pay-gate';

const chipIn = (over: Partial<ChipIn> = {}): ChipIn => ({
  chipIn: 'c1',
  farm: 'f1',
  by: 'june',
  what: { for: 'theme', theme: 'snowy_hollow' },
  state: 'covered',
  closesAt: null,
  filled: 1,
  people: ['june', 'pip'],
  mine: { tier: 'kf.chipin.200', state: 'promised' },
  ...over,
});

describe('paying a share of a chip-in', () => {
  it('opens the store only once the chip-in is covered and the share is still a promise', () => {
    expect(payGate('c1', [chipIn()])).toEqual({ kind: 'pay', tier: 'kf.chipin.200' });
  });

  it('never opens the store while the chip-in is still filling', () => {
    const open = chipIn({ state: 'open', filled: 0.5 });
    expect(payGate('c1', [open])).toEqual({ kind: 'refresh', chipIn: open });
  });

  it('never charges a share twice, or once the chip-in has closed', () => {
    const paid = chipIn({ mine: { tier: 'kf.chipin.200', state: 'paid' } });
    expect(payGate('c1', [paid])).toEqual({ kind: 'refresh', chipIn: paid });
    const closed = chipIn({ state: 'closed' });
    expect(payGate('c1', [closed])).toEqual({ kind: 'refresh', chipIn: closed });
    expect(payGate('c1', [chipIn({ mine: null })]).kind).toBe('refresh');
  });

  it('says so when the chip-in is gone from the farm’s list', () => {
    expect(payGate('c1', [])).toEqual({ kind: 'gone' });
  });
});
