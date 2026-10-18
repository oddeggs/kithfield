import { afterEach, describe, expect, it } from '@jest/globals';

import { kithfieldRules } from '../../data/farm-rules';
import { FarmTestServer } from '../../data/test/farm-test-server';
import { FAST, TestPhone, until } from '../../data/test/test-phone';
import { bringUpToDate } from './bed-sync';

const LOT = 'f_lot';
const POND = 'f_pond';
const BEA = 'p_bea';
const PIP = 'p_pip';

const phones: TestPhone[] = [];
afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

async function setup() {
  const server = new FarmTestServer(kithfieldRules);
  for (const farm of [LOT, POND]) {
    server.createFarm(farm, BEA, farm);
    server.join(farm, PIP);
  }
  const pip = await TestPhone.start(server, PIP, FAST);
  phones.push(pip);
  return { server, pip };
}

const head = (server: FarmTestServer, farm: string) => server.farmOf(farm).log.length;

describe('the seed bed bringing every farm up to date', () => {
  it('pages a farm it holds over http and opens the socket for one it holds nothing of', async () => {
    const { server, pip } = await setup();
    // The phone has the lot already (it was open once), and nothing of the pond.
    const release = pip.client.hold(LOT);
    await until(async () => (await pip.state(LOT)).lastSeq === head(server, LOT));
    release();
    server.write(LOT, BEA, 'message', { text: 'picnic?' });
    server.write(POND, BEA, 'message', { text: 'board games?' });

    await bringUpToDate(pip.client, [LOT, POND], { stillWanted: () => true });

    expect((await pip.state(LOT)).lastSeq).toBe(head(server, LOT));
    expect((await pip.state(POND)).lastSeq).toBe(head(server, POND));
    // The socket it opened for the pond is let go again.
    await until(() => pip.client.link(POND).status !== 'live');
  });

  it('stops opening sockets once the seed bed is left', async () => {
    const { pip } = await setup();
    await bringUpToDate(pip.client, [LOT, POND], { stillWanted: () => false });
    expect((await pip.state(LOT)).lastSeq).toBe(0);
    expect((await pip.state(POND)).lastSeq).toBe(0);
  });
});
