import { afterEach, describe, expect, it } from '@jest/globals';

import { FarmTestServer } from './test/farm-test-server';
import { kithfieldRules } from './farm-rules';
import { TestPhone, until } from './test/test-phone';

const phones: TestPhone[] = [];

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

describe('what the hooks read', () => {
  // useSyncExternalStore re-renders forever when a snapshot is a new object on every read.
  it('answers the same object until something changes', async () => {
    const server = new FarmTestServer(kithfieldRules);
    server.createFarm('f_lot', 'p_bea', 'The Lot');
    const bea = await TestPhone.start(server, 'p_bea');
    phones.push(bea);

    expect(bea.client.link('f_never_held')).toBe(bea.client.link('f_never_held'));
    expect(bea.client.link('f_lot')).toBe(bea.client.link('f_other'));
    expect(bea.client.rejections()).toBe(bea.client.rejections());
    expect(bea.client.cottage.getState()).toBe(bea.client.cottage.getState());
    const replica = await bea.client.replica('f_lot');
    expect(replica.getState()).toBe(replica.getState());
    // Let the cottage finish connecting, so no request outlives the test.
    await until(() => bea.client.cottage.getState().link.status === 'live');
  });
});
