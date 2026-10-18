import { afterEach, describe, expect, it } from '@jest/globals';
import type { FarmState } from '@kithfield/contracts';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { FarmReplicaState } from './farm-replica';
import { kithfieldRules } from './farm-rules';
import { DataProvider, useFarmLink, useFarmSelector, usePresence } from './react';
import { FarmTestServer } from './test/farm-test-server';
import { TestPhone, until } from './test/test-phone';

// React's test environment flag, so `act` works outside a browser.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FARM = 'f_lot';
const phones: TestPhone[] = [];
const renderers: ReactTestRenderer[] = [];

afterEach(async () => {
  await act(() => {
    for (const r of renderers.splice(0)) r.unmount();
  });
  for (const phone of phones.splice(0)) phone.stop();
});

async function setup() {
  const server = new FarmTestServer(kithfieldRules);
  server.createFarm(FARM, 'p_bea', 'The Lot');
  server.join(FARM, 'p_pip');
  const bea = await TestPhone.start(server, 'p_bea');
  const pip = await TestPhone.start(server, 'p_pip');
  phones.push(bea, pip);
  return { server, bea, pip };
}

async function render(phone: TestPhone, node: ReactNode) {
  let renderer: ReactTestRenderer | undefined;
  await act(() => {
    renderer = create(
      <DataProvider client={phone.client} rules={kithfieldRules}>
        {node}
      </DataProvider>,
    );
  });
  if (renderer) renderers.push(renderer);
}

/** Lets subscriptions settle inside `act`. */
const settle = (ms = 30) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

const pinsOf = (farm: FarmReplicaState | null): readonly number[] => farm?.state?.pins ?? [];
const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

describe('the hooks, rendered', () => {
  it('reads an unopened farm’s link without rendering in a loop', async () => {
    const { bea } = await setup();
    const seen: string[] = [];
    function Link() {
      seen.push(useFarmLink('f_never_held').status);
      return null;
    }
    await render(bea, <Link />);
    await settle();
    expect(seen.length).toBeLessThanOrEqual(2);
    expect(new Set(seen)).toEqual(new Set(['stopped']));
  });

  it('re-renders a selector only when what it selects changes', async () => {
    const { bea, pip } = await setup();
    const pins: (readonly number[])[] = [];
    function Pins() {
      pins.push(useFarmSelector(FARM, pinsOf, sameList));
      return null;
    }
    await render(bea, <Pins />);
    bea.client.hold(FARM);
    pip.client.hold(FARM);
    await until(
      () => bea.client.link(FARM).status === 'live' && pip.client.link(FARM).status === 'live',
    );
    await settle();
    const before = pins.length;

    // A message changes the farm but not its pins: no render.
    await act(async () => {
      await pip.client.send(FARM, 'message', { text: 'hello' });
    });
    await until(async () => (await bea.state(FARM)).lastSeq === (await pip.state(FARM)).lastSeq);
    await settle();
    expect(pins.length).toBe(before);

    // A pin does change them.
    const target = (await bea.state(FARM)).lastSeq;
    await act(async () => {
      await pip.client.send(FARM, 'pin', { target, on: true });
    });
    await until(() => pins.at(-1)?.includes(target) === true);
    expect(pins.length).toBeGreaterThan(before);
  });

  it('shows who is writing, apart from the farm', async () => {
    const { bea, pip } = await setup();
    const typing: (readonly string[])[] = [];
    const farms: (FarmState | null)[] = [];
    function Typing() {
      typing.push(usePresence(FARM).typing);
      return null;
    }
    function Farm() {
      farms.push(useFarmSelector(FARM, (f) => f?.state ?? null));
      return null;
    }
    await render(
      bea,
      <>
        <Typing />
        <Farm />
      </>,
    );
    bea.client.hold(FARM);
    pip.client.hold(FARM);
    await until(
      () => bea.client.link(FARM).status === 'live' && pip.client.link(FARM).status === 'live',
    );
    await settle();
    const farmRenders = farms.length;

    await act(() => pip.client.typing(FARM, true));
    await until(() => typing.at(-1)?.includes('p_pip') === true);
    await settle();
    expect(farms.length).toBe(farmRenders);
  });
});
