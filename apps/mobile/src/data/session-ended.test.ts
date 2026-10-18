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
async function livePhone(uploading = 0) {
  const server = new FarmTestServer(kithfieldRules);
  server.createFarm(FARM, BEA, 'The Lot');
  server.join(FARM, PIP);
  server.write(FARM, BEA, 'wave', { to: PIP });
  const media = { cleared: false };
  const pip = await TestPhone.start(server, PIP, FAST, {
    pendingCount: () => Promise.resolve(uploading),
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

  it('wipes the phone when the re-check a 401 asks for confirms the session is gone', async () => {
    const { server, pip, media } = await livePhone(2);
    server.people.delete(PIP);
    const error = await pip.client.api.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    await wiped(pip, media);
    expect(pip.rechecks).toBe(1);
    // What was still waiting is counted, as signing out counts it.
    expect(pip.reports).toContainEqual({ type: 'unsent_at_session_end', count: 2 });
  });

  it('keeps everything on a stale 401 whose re-check finds the session live, and retries once', async () => {
    const { pip, media } = await livePhone();
    const before = pip.calls.length;
    pip.staleFor.push('/v1/rt-token');
    const issued = await pip.client.api.rtToken(FARM);
    expect(issued.token).toBeTruthy();
    expect(pip.rechecks).toBe(1);
    expect(pip.calls.slice(before)).toEqual(['POST /v1/rt-token', 'POST /v1/rt-token']);
    expect(pip.client.status().sessionEnded).toBe(false);
    expect(media.cleared).toBe(false);
    expect((await pip.client.store.farm(FARM)).lastSeq).toBeGreaterThan(0);
    expect(pip.client.link(FARM).status).toBe('live');
  });

  it('runs one re-check for a burst of 401s', async () => {
    const { pip } = await livePhone();
    for (let i = 0; i < 5; i++) pip.staleFor.push('/v1/rt-token');
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => pip.client.api.rtToken(FARM)),
    );
    expect(answers).toHaveLength(5);
    expect(pip.rechecks).toBe(1);
    expect(pip.client.status().sessionEnded).toBe(false);
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
