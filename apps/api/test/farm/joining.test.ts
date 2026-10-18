import {
  CreateFarmResponse,
  FarmEvent,
  FarmGate,
  FarmList,
  InvitePreview,
  WaitingList,
} from '@kithfield/contracts';
import { createMessageBatch, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  readSignIn,
  sendCode,
  signInAnonymously,
  signInWithCode,
  watchLetters,
} from '../../src/auth/testing/client';
import { cottageOf } from '../../src/cottage/stub';
import { consumeDeletion } from '../../src/deletion';
import { op } from './support/client';
import {
  api,
  cast,
  critter,
  farmStub,
  type Person,
  plantFarm,
  profile,
  type TestPorts,
  useTestPorts,
} from './support/doubles';

let ports: TestPorts;
beforeEach(() => {
  ports = useTestPorts();
});

const membership = (farm: string, person: string) =>
  env.DB.prepare('SELECT role, left_at FROM memberships WHERE farm_id = ? AND person_id = ?')
    .bind(farm, person)
    .first();

const plant = async (keeper: Person) => {
  const body = {
    name: 'The Thursday Lot',
    land: 'meadow',
    timeZone: 'Europe/London',
    hemisphere: 'north',
  };
  const created = await api(keeper, 'POST', '/v1/farms', body);
  expect(created.status).toBe(201);
  return CreateFarmResponse.parse(created.body);
};

const codeOf = (url: string) => url.split('/i/')[1] ?? '';

describe('planting and joining', () => {
  it('plants a farm with its keeper, in the log and in D1, with an invite link', async () => {
    const { pip } = await cast('pip');
    const { farm, invite } = await plant(pip);
    expect(invite.url).toBe(`https://dev.kithfield.com/i/${invite.code}`);
    expect(await membership(farm, pip.id)).toEqual({ role: 'keeper', left_at: null });
    const events = (await farmStub(farm).page({ limit: 10 })).events.map((e) => FarmEvent.parse(e));
    expect(events.map((e) => [e.seq, e.kind, e.actor])).toEqual([
      [1, 'farm_created', null],
      [2, 'joined', pip.id],
    ]);
    const bad = { name: 'x', land: 'meadow', timeZone: 'Mars/Olympus_Mons', hemisphere: 'north' };
    expect((await api(pip, 'POST', '/v1/farms', bad)).status).toBe(400);
    expect((await api(null, 'POST', '/v1/farms', {})).status).toBe(401);
    const { token } = await signInAnonymously();
    const nobody = { id: '', token, name: '', critter: critter('fox') };
    expect((await api(nobody, 'POST', '/v1/farms', { ...bad, timeZone: 'UTC' })).status).toBe(403);
  });

  it('previews an invite publicly, joins through it, and lists the farm for both', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, invite } = await plant(pip);
    const preview = InvitePreview.parse(
      (await api(null, 'GET', `/v1/invites/${invite.code}`)).body,
    );
    expect(preview).toEqual({
      name: 'The Thursday Lot',
      land: 'meadow',
      critters: [pip.critter],
      full: false,
      approval: false,
    });
    const joined = await api(fig, 'POST', `/v1/invites/${invite.code}/join`, profile(fig));
    expect(joined).toEqual({ status: 200, body: { farm, status: 'joined' } });
    expect(await membership(farm, fig.id)).toEqual({ role: 'critter', left_at: null });
    const list = FarmList.parse((await api(fig, 'GET', '/v1/farms')).body);
    expect(list.farms).toEqual([
      expect.objectContaining({
        farm,
        kind: 'farm',
        name: 'The Thursday Lot',
        role: 'critter',
        with: null,
      }),
    ]);
    const chats = await cottageOf(env, fig.id).chatList();
    expect(chats).toEqual([
      expect.objectContaining({ farm, farmKind: 'farm', name: 'The Thursday Lot' }),
    ]);
    expect((await api(null, 'GET', '/v1/invites/nope1234')).body).toEqual({
      error: { code: 'invite_invalid' },
    });
  });

  it('retires the old link when a keeper makes a new one', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, invite } = await plant(pip);
    await api(fig, 'POST', `/v1/invites/${invite.code}/join`, profile(fig));
    expect((await api(fig, 'POST', `/v1/farms/${farm}/invites`, { expiresAt: null })).status).toBe(
      403,
    );
    const fresh = await api(pip, 'POST', `/v1/farms/${farm}/invites`, {
      expiresAt: ports.clock.at + 1,
    });
    expect(fresh.status).toBe(201);
    expect((await api(null, 'GET', `/v1/invites/${invite.code}`)).status).toBe(404);
    const url = (fresh.body as { url: string }).url;
    expect((await api(null, 'GET', `/v1/invites/${codeOf(url)}`)).status).toBe(200);
  });

  it('keeps people waiting where the keeper lets them in, and lets them in or not, quietly', async () => {
    const { pip, kit, bea } = await cast('pip', 'kit', 'bea');
    const { farm, invite } = await plant(pip);
    await farmStub(farm).command(pip.id, {
      opId: op(1),
      kind: 'settings_changed',
      payload: { setting: 'approval', on: true },
    });
    const asked = await api(kit, 'POST', `/v1/invites/${invite.code}/join`, profile(kit));
    expect(asked.body).toEqual({ farm, status: 'waiting_for_keeper' });
    await api(bea, 'POST', `/v1/invites/${invite.code}/join`, profile(bea));
    const waiting = WaitingList.parse(
      (await api(pip, 'GET', `/v1/farms/${farm}/waiting`)).body,
    ).waiting;
    expect(waiting.map((w) => w.name)).toEqual(['Kit', 'Bea']);
    expect(
      (await api(pip, 'POST', `/v1/farms/${farm}/waiting/${kit.id}`, { approve: true })).status,
    ).toBe(204);
    expect(
      (await api(pip, 'POST', `/v1/farms/${farm}/waiting/${bea.id}`, { approve: false })).status,
    ).toBe(204);
    expect(await membership(farm, kit.id)).toMatchObject({ role: 'critter' });
    expect(await membership(farm, bea.id)).toBeNull();
    expect((await api(kit, 'GET', `/v1/farms/${farm}/waiting`)).status).toBe(403);
  });
});

describe('visits', () => {
  it('opens one visit per pair, finds it again from either side, and shows each the other', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const opened = await api(pip, 'POST', '/v1/visits', {
      person: fig.id,
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    expect(opened.status).toBe(201);
    const { farm } = opened.body as { farm: string };
    const back = await api(fig, 'POST', '/v1/visits', {
      person: pip.id,
      timeZone: 'Asia/Ho_Chi_Minh',
      hemisphere: 'north',
    });
    expect(back.body).toEqual({ farm });
    expect(await farmStub(farm).state()).toMatchObject({
      kind: 'visit',
      name: null,
      land: 'porch',
    });
    const list = FarmList.parse((await api(pip, 'GET', '/v1/farms')).body);
    expect(list.farms).toEqual([
      expect.objectContaining({
        farm,
        kind: 'visit',
        with: { person: fig.id, name: 'Fig', critter: fig.critter },
      }),
    ]);
    const chats = await cottageOf(env, fig.id).chatList();
    expect(chats).toEqual([
      expect.objectContaining({
        farm,
        farmKind: 'visit',
        with: expect.objectContaining({ person: pip.id }) as unknown,
      }),
    ]);
    const self = { person: pip.id, timeZone: 'UTC', hemisphere: 'north' };
    expect((await api(pip, 'POST', '/v1/visits', self)).status).toBe(400);
  });
});

describe('notifications', () => {
  it('mutes a farm in the caller’s cottage only', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const settings = {
      mutedUntil: 'always',
      knockFor: { plans: true, doorstep: true, mentions: true, messages: false },
    };
    expect(await api(fig, 'PUT', `/v1/farms/${farm}/notifications`, settings)).toEqual({
      status: 200,
      body: settings,
    });
    expect((await cottageOf(env, fig.id).chatList())[0]).toMatchObject({ farm, muted: true });
    expect((await cottageOf(env, pip.id).chatList())[0]).toMatchObject({ farm, muted: false });
    const row = await env.DB.prepare(
      'SELECT knock_for FROM memberships WHERE farm_id = ? AND person_id = ?',
    )
      .bind(farm, fig.id)
      .first<{ knock_for: string }>();
    expect(JSON.parse(row?.knock_for ?? 'null')).toEqual(settings.knockFor);
  });
});

describe('the gate and trading', () => {
  it('shows visitors the farm, never its chat, and takes their gestures', async () => {
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    const { farm } = await plantFarm(pip, [fig]);
    const gate = FarmGate.parse((await api(kit, 'GET', `/v1/farms/${farm}/gate`)).body);
    expect(gate.critters.map((c) => c.name)).toEqual(['Pip', 'Fig']);
    const firefly = {
      opId: op(1),
      gesture: { gesture: 'firefly', to: fig.id, words: 'hello from next door' },
    };
    expect((await api(kit, 'POST', `/v1/farms/${farm}/gate`, firefly)).body).toEqual({
      result: 'ack',
      opId: op(1),
      seq: 4,
    });
    const lost = { opId: op(2), gesture: { gesture: 'firefly', to: kit.id } };
    expect((await api(kit, 'POST', `/v1/farms/${farm}/gate`, lost)).body).toMatchObject({
      reason: 'not_found',
    });
    const own = { opId: op(3), gesture: { gesture: 'wave' } };
    expect((await api(fig, 'POST', `/v1/farms/${farm}/gate`, own)).body).toMatchObject({
      reason: 'not_allowed',
    });
  });

  it('writes a swap of harvested crops on both farms, each with its own trader, once a season', async () => {
    const { pip, mo, kit } = await cast('pip', 'mo', 'kit');
    const home = await plantFarm(pip);
    const away = await plantFarm(mo, [kit]);
    // Five days of dewdrops bring each farm's dew plant to bloom; harvest day puts it in the basket.
    for (let day = 0; day < 5; day++) {
      for (let n = 0; n < 3; n++) {
        await home.stub.command(pip.id, {
          opId: op(day * 10 + n, 1),
          kind: 'dewdrop',
          payload: {},
        });
        await away.stub.command(kit.id, {
          opId: op(day * 10 + n, 2),
          kind: 'dewdrop',
          payload: {},
        });
      }
      ports.clock.advance(24 * 60 * 60_000);
    }
    for (const { stub } of [home, away]) {
      ports.clock.at = (await runInDurableObject(stub, (_f, s) => s.storage.getAlarm())) ?? 0;
      await runDurableObjectAlarm(stub);
    }
    const crop = (await home.stub.state())?.basket?.crops[0];
    expect(crop?.plant).toBe('marigold');
    const trade = {
      opId: op(1),
      from: away.farm,
      with: pip.id,
      give: 'marigold',
      take: 'marigold',
    };
    const first = await api(kit, 'POST', `/v1/farms/${home.farm}/trade`, trade);
    expect(first.body).toMatchObject({ result: 'ack', opId: op(1) });
    expect((await api(kit, 'POST', `/v1/farms/${home.farm}/trade`, trade)).body).toEqual(
      first.body,
    );
    const last = async (stub: typeof home.stub) =>
      FarmEvent.parse((await stub.page({ limit: 1 })).events[0]);
    expect(await last(home.stub)).toMatchObject({
      kind: 'traded',
      actor: pip.id,
      payload: { with: kit.id, otherFarm: away.farm },
    });
    expect(await last(away.stub)).toMatchObject({
      kind: 'traded',
      actor: kit.id,
      payload: { with: pip.id, otherFarm: home.farm },
    });
    const again = await api(kit, 'POST', `/v1/farms/${home.farm}/trade`, { ...trade, opId: op(2) });
    expect(again.body).toMatchObject({ result: 'rejected', reason: 'limit_reached' });
    expect(
      (await api(pip, 'POST', `/v1/farms/${home.farm}/trade`, { ...trade, opId: op(3) })).status,
    ).toBe(403);
  });
});

describe('merging people', () => {
  it('moves an anonymous person’s farms to the account they signed in to, and keeps their words theirs', async () => {
    const email = `farm.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const letters = watchLetters();
    await sendCode(email);
    const returning = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    await stub.command(fig.id, { opId: op(1), kind: 'message', payload: { text: 'hello' } });

    await sendCode(email, { token: fig.token });
    await readSignIn(await signInWithCode(email, letters.codeFor(email), { token: fig.token }));
    const into = returning.user.id;
    expect(await membership(farm, into)).toEqual({ role: 'critter', left_at: null });
    expect(await membership(farm, fig.id)).toBeNull();

    const job = { kind: 'person_merged', from: fig.id, into, at: ports.clock.at };
    await consumeDeletion(
      createMessageBatch('kithfield-deletion-dev', [
        { id: 'm1', timestamp: new Date(), attempts: 1, body: job },
      ]),
      env,
    );
    expect((await stub.state())?.members.map((m) => m.person)).toEqual([pip.id, into]);
    const edit = await stub.command(into, {
      opId: op(2),
      kind: 'edit',
      payload: { target: 4, text: 'hello!' },
    });
    expect(edit).toMatchObject({ result: 'ack', seq: 5 });
    const old = await stub.command(fig.id, { opId: op(3), kind: 'dewdrop', payload: {} });
    expect(old).toMatchObject({ result: 'ack' });
    expect((await stub.page({ limit: 1 })).events[0]).toMatchObject({ actor: into });
  });
});
