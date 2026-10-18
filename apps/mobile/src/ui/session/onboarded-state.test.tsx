import { afterEach, describe, expect, it } from '@jest/globals';
import type { Me } from '@kithfield/contracts';
import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { me as sample } from './me.test-data';
import { readOnboarded, type OnboardedStore } from './onboarded';
import { useOnboardedState, type OnboardedDeps } from './onboarded-state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderers: ReactTestRenderer[] = [];
afterEach(async () => {
  await act(() => {
    for (const r of renderers.splice(0)) r.unmount();
  });
});

function memory(remembered?: string): OnboardedStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (remembered) values.set('kithfield.onboarded', remembered);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItemAsync: (key, value) => Promise.resolve(void values.set(key, value)),
  };
}

/** A `GET /v1/me` that answers only when the test says so. */
function server() {
  let answer: ((me: Me) => void) | null = null;
  let fail: ((error: Error) => void) | null = null;
  const calls: number[] = [];
  const me = () => {
    calls.push(Date.now());
    return new Promise<Me>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
  };
  return {
    me,
    calls,
    answer: (value: Me) => act(async () => answer?.(value)),
    fail: () => act(async () => fail?.(new Error('offline'))),
  };
}

function mount(person: string | null, deps: OnboardedDeps) {
  const seen: (boolean | null)[] = [];
  let moveTo: (who: string | null) => void = () => undefined;
  function Probe() {
    const [who, setWho] = useState(person);
    moveTo = setWho;
    seen.push(useOnboardedState(who, deps).onboarded);
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  void act(() => {
    renderer = create(<Probe />);
  });
  if (renderer) renderers.push(renderer);
  const rerender = (who: string | null) =>
    act(() => {
      moveTo(who);
    });
  return { seen, rerender };
}

describe('whether the person is onboarded', () => {
  it('lets a remembered person in on the very first render', () => {
    const api = server();
    const { seen } = mount('p1', { store: memory('p1'), me: api.me });
    expect(seen[0]).toBe(true);
  });

  it('waits under the splash for someone it does not remember', async () => {
    const api = server();
    const { seen } = mount('p1', { store: memory(), me: api.me });
    expect(seen[0]).toBeNull();
    await api.answer(sample());
    expect(seen.at(-1)).toBe(true);
  });

  it('sends someone it does not remember to the way in when the server cannot be reached', async () => {
    const api = server();
    const { seen } = mount('p1', { store: memory(), me: api.me });
    await api.fail();
    expect(seen.at(-1)).toBe(false);
  });

  it('keeps a remembered person in when the server cannot be reached', async () => {
    const api = server();
    const { seen } = mount('p1', { store: memory('p1'), me: api.me });
    await api.fail();
    expect(seen.at(-1)).toBe(true);
  });

  it('sends a remembered person back to accept new Terms, and forgets them', async () => {
    const api = server();
    const store = memory('p1');
    const { seen } = mount('p1', { store, me: api.me });
    await api.answer(sample({ termsVersion: '2025-01-01' }));
    expect(seen.at(-1)).toBe(false);
    expect(readOnboarded(store, 'p1')).toBe(false);
  });

  it('checks again when the session moves to another person', async () => {
    const api = server();
    const { seen, rerender } = mount('p1', { store: memory(), me: api.me });
    await api.answer(sample({ person: 'p1', name: null, critter: null }));
    expect(seen.at(-1)).toBe(false);
    await rerender('p2');
    expect(seen.at(-1)).toBeNull();
    expect(api.calls).toHaveLength(2);
    await api.answer(sample({ person: 'p2' }));
    expect(seen.at(-1)).toBe(true);
  });

  it('forgets the remembered person when there is no person any more', async () => {
    const api = server();
    const store = memory('p1');
    const { rerender } = mount('p1', { store, me: api.me });
    await rerender(null);
    expect(readOnboarded(store, 'p1')).toBe(false);
  });
});
