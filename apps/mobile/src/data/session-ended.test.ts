import { afterEach, describe, expect, it } from '@jest/globals';

import { ApiError } from './api-client';
import { kithfieldRules } from './farm-rules';
import { FarmTestServer } from './test/farm-test-server';
import { FAST, TestPhone, until } from './test/test-phone';

const FARM = 'f_lot';
const BEA = 'p_bea';
const PIP = 'p_pip';

const phones: TestPhone[] = [];

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

/** Pip's phone, live with Bea's wave cached, and a media queue that says whether it was cleared. */
async function livePhone() {
  const server = new FarmTestServer(kithfieldRules);
  server.createFarm(FARM, BEA, 'The Lot');
  server.join(FARM, PIP);
  server.write(FARM, BEA, 'wave', { to: PIP });
  const media = { cleared: false };
  const pip = await TestPhone.start(server, PIP, FAST, {
    pendingCount: () => Promise.resolve(0),
    clear: () => {
      media.cleared = true;
      return Promise.resolve();
    },
  });
  phones.push(pip);
  pip.client.hold(FARM);
  await until(() => pip.client.link(FARM).status === 'live');
  await until(() => pip.client.cottage.getState().link.status === 'live');
  expect((await pip.client.store.farm(FARM)).lastSeq).toBeGreaterThan(0);
  return { server, pip, media };
}

/** Everything the person held is gone, as after signing out, and the app offers sign-in. */
async function wiped(pip: TestPhone, media: { cleared: boolean }) {
  await until(() => pip.client.status().sessionEnded);
  await until(async () => (await pip.client.store.farm(FARM)).lastSeq === 0 && media.cleared);
  expect(await pip.client.events(FARM, { limit: 5 })).toEqual([]);
  expect((await pip.state(FARM)).state).toBeNull();
}

describe('a session ended from another device', () => {
  it('wipes the phone when the farm socket says the session ended', async () => {
    const { server, pip, media } = await livePhone();
    server.endSession(PIP, 'farm');
    await wiped(pip, media);
    expect(pip.client.cottage.getState().link.status).toBe('stopped');
    const hellos = server.hellos.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.hellos).toHaveLength(hellos);
  });

  it('wipes the phone when the cottage socket says the session ended', async () => {
    const { server, pip, media } = await livePhone();
    server.endSession(PIP, 'cottage');
    await wiped(pip, media);
  });

  it('wipes the phone when an API call answers 401', async () => {
    const { server, pip, media } = await livePhone();
    server.people.delete(PIP);
    const error = await pip.client.api.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    await wiped(pip, media);
  });

  it('takes writes again once the person signs back in', async () => {
    const { server, pip, media } = await livePhone();
    server.endSession(PIP, 'farm');
    await wiped(pip, media);

    pip.client.personChanged();
    await until(() => pip.client.link(FARM).status === 'live');
    const sent = await pip.client.send(FARM, 'wave', { to: BEA });
    expect(sent.status).toBe('queued');
    await until(() =>
      server.farmOf(FARM).log.some((e) => sent.status === 'queued' && e['opId'] === sent.opId),
    );
  });
});
