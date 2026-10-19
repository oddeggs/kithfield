import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { createAsks, forgetDeclined, type AskDeps, type Permission } from './asks';

const allowed: Permission = { granted: true, canAskAgain: true };
const notYet: Permission = { granted: false, canAskAgain: true };
const off: Permission = { granted: false, canAskAgain: false };

function deps(state: Permission, sheetYes: boolean, after: Permission = allowed) {
  const calls = { sheet: 0, request: 0 };
  const d: AskDeps = {
    current: () => Promise.resolve(state),
    request: () => {
      calls.request += 1;
      return Promise.resolve(after);
    },
    sheet: () => {
      calls.sheet += 1;
      return Promise.resolve(sheetYes);
    },
  };
  return { d, calls };
}

describe('asking for the mic and camera by the fire', () => {
  beforeEach(forgetDeclined);

  it('asks in the farm’s words first, then iOS', async () => {
    const { d, calls } = deps(notYet, true);
    expect(await createAsks(d)('mic', 'Bea')).toBe('allowed');
    expect(calls).toEqual({ sheet: 1, request: 1 });
  });

  it('never asks again in the same session after a no', async () => {
    const { d, calls } = deps(notYet, false);
    const ask = createAsks(d);
    expect(await ask('mic')).toBe('declined');
    expect(await ask('mic')).toBe('declined');
    expect(calls).toEqual({ sheet: 1, request: 0 });
  });

  it('takes iOS’s no as just listening, and doesn’t ask again', async () => {
    const { d, calls } = deps(notYet, true, off);
    const ask = createAsks(d);
    expect(await ask('camera')).toBe('declined');
    expect(await ask('camera')).toBe('declined');
    expect(calls.sheet).toBe(1);
  });

  it('skips the sheet when already allowed, or when iOS won’t ask any more', async () => {
    expect(await createAsks(deps(allowed, false).d)('mic')).toBe('allowed');
    const { d, calls } = deps(off, true);
    expect(await createAsks(d)('mic')).toBe('declined');
    expect(calls.sheet).toBe(0);
  });
});
