import { afterEach, describe, expect, it } from '@jest/globals';
import { LIMITS } from '@kithfield/contracts';

import { kithfieldRules } from './farm-rules';
import { FarmTestServer } from './test/farm-test-server';
import { FAST, TestPhone, until } from './test/test-phone';

const FARM = 'f_lot';
const BEA = 'p_bea';
const PIP = 'p_pip';

const phones: TestPhone[] = [];

async function setup() {
  const server = new FarmTestServer(kithfieldRules);
  server.createFarm(FARM, BEA, 'The Lot');
  server.join(FARM, PIP);
  const pip = await TestPhone.start(server, PIP, FAST);
  phones.push(pip);
  return { server, pip };
}

const head = (server: FarmTestServer) => server.farmOf(FARM).log.length;
const say = (server: FarmTestServer, n: number) => {
  for (let i = 0; i < n; i += 1) server.write(FARM, BEA, 'message', { text: `hello ${i}` });
};

/** Opens the farm's socket until the phone holds the farm as it stands, then lets it go. */
async function holdOnce(pip: TestPhone, server: FarmTestServer) {
  const release = pip.client.hold(FARM);
  await until(async () => (await pip.state(FARM)).lastSeq === head(server));
  release();
  await until(() => pip.client.link(FARM).status !== 'live');
}

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

describe('catching a farm up without its socket', () => {
  it('leaves a farm the phone holds nothing of to the socket, which sends the snapshot', async () => {
    const { pip } = await setup();
    expect(await pip.client.catchUp(FARM)).toBe('needs_socket');
    expect((await pip.state(FARM)).lastSeq).toBe(0);
  });

  it('pages a farm the phone holds up to the farm’s newest event', async () => {
    const { server, pip } = await setup();
    await holdOnce(pip, server);
    say(server, 3);
    expect(await pip.client.catchUp(FARM)).toBe('done');
    expect((await pip.state(FARM)).lastSeq).toBe(head(server));
  });

  it('leaves the open farm to its socket', async () => {
    const { server, pip } = await setup();
    pip.client.hold(FARM);
    await until(async () => (await pip.state(FARM)).lastSeq === head(server));
    expect(await pip.client.catchUp(FARM)).toBe('open');
  });

  it('sends a farm more than a snapshot gap behind to the socket', async () => {
    const { server, pip } = await setup();
    await holdOnce(pip, server);
    const before = (await pip.state(FARM)).lastSeq;
    say(server, LIMITS.snapshotGap + 1);
    expect(await pip.client.catchUp(FARM)).toBe('needs_socket');
    expect((await pip.state(FARM)).lastSeq).toBe(before);
  });
});
