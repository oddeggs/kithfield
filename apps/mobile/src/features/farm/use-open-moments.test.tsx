import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { FarmState } from '@kithfield/contracts';
import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { farmLog } from './farm-log.test-data';
import { useOpenMoments } from './use-open-moments';

/* The data layer, the router and the phone's flags, stood in for: what the hook pushes is checked. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = jest.fn();
const mockFlags = new Map<string, string>();
const mockHeld: { current: { state: FarmState; lastSeq: number } | null } = { current: null };
const mockServer: { answer: (() => void) | null; opened: number } = { answer: null, opened: 0 };

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('../../data', () => {
  const client = {
    pageHistory: () =>
      new Promise<boolean>((resolve) => {
        mockServer.answer = () => resolve(true);
      }),
    events: () =>
      Promise.resolve([{ kind: 'farm_opened', actor: 'p_june', at: mockServer.opened, seq: 9 }]),
  };
  return { useDataClient: () => client, useFarm: () => mockHeld.current };
});
// A new pair of functions on every render, as a hook without memo hands out.
jest.mock('./valley-store', () => ({
  useFarmFlags: () => ({
    read: (flag: string) => Promise.resolve(mockFlags.get(flag) ?? null),
    write: (flag: string, value: string | null) =>
      Promise.resolve(void (value === null ? mockFlags.delete(flag) : mockFlags.set(flag, value))),
  }),
}));

const renderers: ReactTestRenderer[] = [];

beforeEach(() => {
  mockPush.mockReset();
  mockFlags.clear();
  mockServer.answer = null;
});

afterEach(async () => {
  await act(() => {
    for (const r of renderers.splice(0)) r.unmount();
  });
  jest.useRealTimers();
});

let redraw: () => void = () => undefined;

function Probe() {
  const [tick, setTick] = useState(0);
  redraw = () => setTick((n) => n + 1);
  useOpenMoments('f_lot', 'p_june');
  return tick;
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

describe('the farm opening on move-in day', () => {
  it('celebrates your own move-in even when the farm redraws while the log is fetched', async () => {
    // Just through onboarding: joined a minute ago, and the snapshot already carries this visit.
    const log = farmLog([['p_june', 'rabbit']]);
    log.wait(60_000).add('farm_opened', 'p_june', {});
    mockServer.opened = log.at;
    mockHeld.current = { state: log.state(), lastSeq: 3 };
    jest.useFakeTimers({ now: log.at + 1_000, doNotFake: ['queueMicrotask'] });

    await act(() => {
      renderers.push(create(<Probe />));
    });
    await settle();
    // The farm redraws (a clock tick, the view arriving) before the server answers.
    await act(() => redraw());
    await settle();
    await act(async () => {
      mockServer.answer?.();
      await Promise.resolve();
    });
    await settle();

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0]?.[0]).toMatchObject({
      pathname: '/(tabs)/farm/move-in',
      params: { farm: 'f_lot', person: 'p_june' },
    });
    expect(mockFlags.get('joinsSeen')).toBe(String(log.state().members[0]?.joinedAt));
  });
});
