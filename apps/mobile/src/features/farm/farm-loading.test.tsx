import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LOADER_AFTER_MS, useFarmLoading } from './farm-loading';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Loading = ReturnType<typeof useFarmLoading>;

const renderers: ReactTestRenderer[] = [];
let seen: Loading | null = null;
let arrive: (what: { data?: boolean; drawn?: boolean }) => void = () => undefined;

function Probe({ data, drawn }: { readonly data: boolean; readonly drawn: boolean }) {
  const [now, setNow] = useState({ data, drawn });
  arrive = (what) => setNow((was) => ({ ...was, ...what }));
  seen = useFarmLoading(now.data, now.drawn);
  return null;
}

const mount = (data: boolean, drawn: boolean) =>
  act(() => {
    renderers.push(create(<Probe data={data} drawn={drawn} />));
  });
const after = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
const current = (): Loading => {
  if (!seen) throw new Error('not rendered');
  return seen;
};

beforeEach(() => {
  jest.useFakeTimers();
  seen = null;
});

afterEach(async () => {
  await act(() => {
    for (const r of renderers.splice(0)) r.unmount();
  });
  jest.useRealTimers();
});

describe('the farm drawing itself in', () => {
  it('shows nothing extra when the farm and its drawing are both in within the wait', async () => {
    await mount(false, false);
    await after(100);
    await act(() => arrive({ data: true }));
    await after(100);
    await act(() => arrive({ drawn: true }));
    await after(LOADER_AFTER_MS);
    expect(current()).toMatchObject({
      covered: false,
      revealing: false,
      loading: false,
      ready: true,
    });
  });

  it('keeps the paper up for a farm whose drawing is late, and reveals once it is drawn', async () => {
    await mount(false, false);
    // Paper from the start, so a farm drawn in the same moment never flashes before the reveal.
    expect(current()).toMatchObject({ covered: true, revealing: false });
    await after(50);
    await act(() => arrive({ data: true }));
    await after(LOADER_AFTER_MS);
    // The farm is known but not drawn: paper, without the pencil rows meant for no farm at all.
    expect(current()).toMatchObject({ revealing: true, loading: false, ready: false });
    await act(() => arrive({ drawn: true }));
    expect(current()).toMatchObject({ revealing: true, ready: true });
    await act(() => current().done());
    expect(current()).toMatchObject({ revealing: false, loading: false });
  });

  it('waits for the drawing of a farm already on the phone too', async () => {
    await mount(true, false);
    await after(LOADER_AFTER_MS);
    expect(current()).toMatchObject({ revealing: true, loading: false, ready: false });
  });

  it('reveals a farm drawn late even when the busy thread held the wait timer back', async () => {
    await mount(false, false);
    // The drawing kept the thread busy: the clock moved on, the timer has not run yet.
    jest.setSystemTime(Date.now() + LOADER_AFTER_MS + 400);
    await act(() => arrive({ data: true, drawn: true }));
    expect(current()).toMatchObject({ revealing: true, ready: true });
  });

  it('shows the pencil rows while nothing of the farm is on the phone', async () => {
    await mount(false, false);
    await after(LOADER_AFTER_MS);
    expect(current()).toMatchObject({ revealing: true, loading: true, ready: false });
  });
});
