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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readSignIn,
  sendCode,
  signInAnonymously,
  signInWithCode,
  watchLetters,
} from '../../src/auth/testing/client';
import { cottageOf } from '../../src/cottage/stub';
import { blocks } from '../../src/farm/blocks';
import { consumeDeletion } from '../../src/deletion';
import { op, TestSocket } from './support/client';
import {
  api,
  cast,
  critter,
  farmStub,
  freshFarmId,
  newPerson,
  type Person,
  plantFarm,
  profile,
  type TestPorts,
  useTestPorts,
  pageOf,
  hostOf,
  settled,
} from './support/doubles';
import { tellFarmsOfProfile } from '../../src/farm/profile-fanout';
import { configureFarmPorts } from '../../src/farm/wiring';

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
    const events = (await pageOf(farmStub(farm), { limit: 10 })).events.map((e) =>
      FarmEvent.parse(e),
    );
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
      from: profile(pip),
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

  it('shows who made the link only while they still live on the farm', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, invite } = await plant(pip);
    await api(fig, 'POST', `/v1/invites/${invite.code}/join`, profile(fig));
    const fromOf = async () =>
      InvitePreview.parse((await api(null, 'GET', `/v1/invites/${invite.code}`)).body).from;
    expect(await fromOf()).toEqual(profile(pip));
    await farmStub(farm).command(pip.id, { opId: op(1), kind: 'left', payload: {} });
    expect(await fromOf()).toBeNull();
  });

  it('shows nobody as the link’s maker once they have deleted their account', async () => {
    const { pip } = await cast('pip');
    const { invite } = await plant(pip);
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(ports.clock.at, pip.id)
      .run();
    const preview = await api(null, 'GET', `/v1/invites/${invite.code}`);
    expect(preview.status).toBe(200);
    expect(InvitePreview.parse(preview.body).from).toBeNull();
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
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    const stranger = await api(pip, 'POST', '/v1/visits', {
      person: kit.id,
      timeZone: 'UTC',
      hemisphere: 'north',
    });
    expect(stranger.status).toBe(404);
    await plantFarm(pip, [fig]);
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
    expect(list.farms.filter((f) => f.kind === 'visit')).toEqual([
      expect.objectContaining({
        farm,
        kind: 'visit',
        with: { person: fig.id, name: 'Fig', critter: fig.critter },
      }),
    ]);
    const chats = await cottageOf(env, fig.id).chatList();
    expect(chats.filter((row) => row.farmKind === 'visit')).toEqual([
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

describe('a visit planted half way', () => {
  it('is planted again when either of them opens it', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    await plantFarm(pip, [fig]);
    const pair = [pip.id, fig.id].sort().join(':');
    // Its D1 row exists, but the farm object never got its first events.
    await env.DB.prepare(
      "INSERT INTO farms (id, kind, name, land, keeper_id, created_at, pair) VALUES ('halfplanted1', 'visit', NULL, 'porch', NULL, 1, ?)",
    )
      .bind(pair)
      .run();
    const opened = await api(fig, 'POST', '/v1/visits', {
      person: pip.id,
      timeZone: 'UTC',
      hemisphere: 'north',
    });
    expect(opened.body).toEqual({ farm: 'halfplanted1' });
    expect((await farmStub('halfplanted1').state())?.members.map((m) => m.person).sort()).toEqual(
      [pip.id, fig.id].sort(),
    );
  });
});

describe('a full farm', () => {
  it('keeps a waiting request the keeper approves, until there is room', async () => {
    const { pip, kit } = await cast('pip', 'kit');
    const { farm, invite } = await plant(pip);
    const stub = farmStub(farm);
    await stub.command(pip.id, {
      opId: op(1),
      kind: 'settings_changed',
      payload: { setting: 'approval', on: true },
    });
    await api(kit, 'POST', `/v1/invites/${invite.code}/join`, profile(kit));
    const others = await Promise.all(Array.from({ length: 23 }, (_, n) => newPerson(`friend${n}`)));
    for (const other of others) await stub.join(other.id, profile(other), true);
    expect(
      (await api(pip, 'POST', `/v1/farms/${farm}/waiting/${kit.id}`, { approve: true })).status,
    ).toBe(409);
    const waiting = WaitingList.parse(
      (await api(pip, 'GET', `/v1/farms/${farm}/waiting`)).body,
    ).waiting;
    expect(waiting.map((w) => w.person)).toEqual([kit.id]);
  });
});

describe('a profile change', () => {
  it('reaches every farm the person lives on once, and their visits’ chat rows', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const opened = await api(pip, 'POST', '/v1/visits', {
      person: fig.id,
      timeZone: 'UTC',
      hemisphere: 'north',
    });
    const visit = (opened.body as { farm: string }).farm;
    const look = critter('hedgehog');
    expect(
      (await api(fig, 'PATCH', '/v1/me/profile', { name: 'Figgy', critter: look })).status,
    ).toBe(200);
    for (const id of [farm, visit]) {
      const me = (await farmStub(id).state())?.members.find((m) => m.person === fig.id);
      expect(me).toMatchObject({ name: 'Figgy', critter: look });
      const last = FarmEvent.parse((await pageOf(farmStub(id), { limit: 1 })).events[0]);
      expect(last).toMatchObject({
        kind: 'critter_changed',
        actor: fig.id,
        payload: { name: 'Figgy', critter: look },
      });
    }
    await settled(farmStub(visit));
    const rows = await cottageOf(env, pip.id).chatList();
    expect(rows.find((r) => r.farm === visit)?.with).toMatchObject({
      person: fig.id,
      name: 'Figgy',
    });

    // Telling the farms about the same change again writes nothing new.
    const before = (await pageOf(stub)).events.length;
    await tellFarmsOfProfile(env, fig.id, { name: 'Figgy', critter: look });
    expect((await pageOf(stub)).events.length).toBe(before);
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

/** Pip and Fig's farm, and Kit, who lives with Fig on another farm: a friend of a friend. */
const neighbours = async () => {
  const { pip, fig, kit, mo } = await cast('pip', 'fig', 'kit', 'mo');
  const home = await plantFarm(pip, [fig]);
  const next = await plantFarm(kit, [fig]);
  return { pip, fig, kit, mo, home, next };
};

describe('the gate', () => {
  it('shows friends of friends the farm, never its chat, and takes their gestures', async () => {
    const { pip, fig, kit, home } = await neighbours();
    const { farm } = home;
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
    const visited = await env.DB.prepare('SELECT farm_id FROM farm_visitors WHERE person_id = ?')
      .bind(kit.id)
      .all();
    expect(visited.results).toEqual([{ farm_id: farm }]);
    const own = { opId: op(3), gesture: { gesture: 'wave' } };
    expect((await api(fig, 'POST', `/v1/farms/${farm}/gate`, own)).status).toBe(404);
    expect((await api(pip, 'GET', `/v1/farms/${farm}/gate`)).status).toBe(404);
  });

  it('is closed to strangers, and to people removed from the farm', async () => {
    const { mo, kit, home, pip } = await neighbours();
    expect((await api(mo, 'GET', `/v1/farms/${home.farm}/gate`)).status).toBe(404);
    const wave = { opId: op(1), gesture: { gesture: 'wave' } };
    expect((await api(mo, 'POST', `/v1/farms/${home.farm}/gate`, wave)).status).toBe(404);
    await home.stub.join(kit.id, profile(kit), true);
    await home.stub.command(pip.id, {
      opId: op(2),
      kind: 'removed',
      payload: { person: kit.id, removeMedia: false },
    });
    expect((await api(kit, 'GET', `/v1/farms/${home.farm}/gate`)).status).toBe(404);
    const after = await api(kit, 'POST', `/v1/farms/${home.farm}/gate`, { ...wave, opId: op(3) });
    expect(after.body).toMatchObject({ result: 'rejected', reason: 'not_allowed' });
  });

  it('counts friends made on farms, not on visits', async () => {
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    const home = await plantFarm(pip, [fig]);
    // Fig and Kit share only a porch.
    const porch = freshFarmId();
    await farmStub(porch).create({
      farm: porch,
      kind: 'visit',
      name: null,
      land: 'porch',
      timeZone: 'UTC',
      hemisphere: 'north',
      keeper: null,
      pair: [fig.id, kit.id].sort().join(':'),
      members: [
        { person: fig.id, profile: profile(fig), via: 'visit' },
        { person: kit.id, profile: profile(kit), via: 'visit' },
      ],
    });
    expect((await api(kit, 'GET', `/v1/farms/${home.farm}/gate`)).status).toBe(404);
  });

  it('hides a member who blocked a visitor from that visitor, and refuses trades between them', async () => {
    const { pip, fig, kit, home, next } = await neighbours();
    // The safety work isn't built yet: this stands in for Pip having blocked Kit.
    const blocked = (a: string, b: string) =>
      [a, b].sort().join() === [pip.id, kit.id].sort().join();
    vi.spyOn(blocks, 'isBlocked').mockImplementation((_env, a, b) =>
      Promise.resolve(blocked(a, b)),
    );
    const gate = FarmGate.parse((await api(kit, 'GET', `/v1/farms/${home.farm}/gate`)).body);
    expect(gate.critters.map((c) => c.person)).toEqual([fig.id]);
    const trade = { opId: op(1), from: next.farm, with: pip.id, give: null, take: 'marigold' };
    expect((await api(kit, 'POST', `/v1/farms/${home.farm}/trade`, trade)).body).toEqual({
      result: 'rejected',
      opId: op(1),
      reason: 'unavailable',
    });
    vi.restoreAllMocks();
  });

  it('takes one gesture a farm day from each visitor, and limits how fast they come', async () => {
    const { kit, home } = await neighbours();
    const wave = (n: number) =>
      api(kit, 'POST', `/v1/farms/${home.farm}/gate`, {
        opId: op(n, 9),
        gesture: { gesture: 'wave' },
      });
    expect((await wave(1)).body).toMatchObject({ result: 'ack' });
    expect((await wave(2)).body).toMatchObject({ result: 'rejected', reason: 'limit_reached' });
    ports.clock.advance(24 * 60 * 60_000);
    expect((await wave(3)).body).toMatchObject({ result: 'ack' });
    const answers = [];
    for (let n = 4; n < 12; n++) answers.push((await wave(n)).status);
    expect(answers).toContain(429);
  });
});

/** Five days of dewdrops bring a farm's dew plant to bloom; harvest day puts it in the basket. */
const growMarigolds = async (farms: { stub: ReturnType<typeof farmStub>; person: Person }[]) => {
  for (let day = 0; day < 5; day++) {
    for (const [i, { stub, person }] of farms.entries()) {
      for (let n = 0; n < 3; n++) {
        await stub.command(person.id, {
          opId: op(day * 10 + n, i + 1),
          kind: 'dewdrop',
          payload: {},
        });
      }
    }
    ports.clock.advance(24 * 60 * 60_000);
  }
  for (const { stub } of farms) {
    ports.clock.at = (await runInDurableObject(stub, (_f, s) => s.storage.getAlarm())) ?? 0;
    await runDurableObjectAlarm(stub);
  }
};

describe('trading', () => {
  it('writes a swap on both farms, each with its own trader, once in 90 days', async () => {
    const { pip, kit, home, next } = await neighbours();
    await growMarigolds([
      { stub: home.stub, person: pip },
      { stub: next.stub, person: kit },
    ]);
    expect((await home.stub.state())?.basket?.crops[0]?.plant).toBe('marigold');
    const trade = {
      opId: op(1),
      from: next.farm,
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
      FarmEvent.parse((await pageOf(stub, { limit: 1 })).events[0]);
    expect(await last(home.stub)).toMatchObject({
      kind: 'traded',
      actor: pip.id,
      payload: { with: kit.id, otherFarm: next.farm },
    });
    expect(await last(next.stub)).toMatchObject({
      kind: 'traded',
      actor: kit.id,
      payload: { with: pip.id, otherFarm: home.farm },
    });
    const again = await api(kit, 'POST', `/v1/farms/${home.farm}/trade`, { ...trade, opId: op(2) });
    expect(again.body).toMatchObject({ result: 'rejected', reason: 'limit_reached' });
    expect(await home.stub.answered(op(2))).toBeNull();
    ports.clock.advance(91 * 24 * 60 * 60_000);
    expect(await home.stub.canTrade(next.farm, pip.id)).toBeNull();
  });

  it('finishes both halves when two farms trade with each other at the same moment', async () => {
    const { pip, kit, home, next } = await neighbours();
    const crop = { plant: 'marigold', variant: null };
    const trade = (opId: string, actor: string, otherFarm: string, peer: string) => ({
      opId,
      actor,
      payload: { with: peer, otherFarm, gave: crop, got: crop },
    });
    // Kit visits home and Pip visits next at once: each visited farm writes its half first.
    const kitsVisit = {
      home: trade(op(1), pip.id, next.farm, kit.id),
      next: trade(op(1), kit.id, home.farm, pip.id),
    };
    const pipsVisit = {
      next: trade(op(2), kit.id, home.farm, pip.id),
      home: trade(op(2), pip.id, next.farm, kit.id),
    };
    await home.stub.recordTrade(kitsVisit.home.opId, kitsVisit.home.actor, kitsVisit.home.payload);
    await next.stub.recordTrade(pipsVisit.next.opId, pipsVisit.next.actor, pipsVisit.next.payload);
    // Then each finishes on the other farm: finishing a recorded trade isn't a new trade.
    const done = { completing: true };
    const a = await next.stub.recordTrade(
      kitsVisit.next.opId,
      kitsVisit.next.actor,
      kitsVisit.next.payload,
      undefined,
      done,
    );
    const b = await home.stub.recordTrade(
      pipsVisit.home.opId,
      pipsVisit.home.actor,
      pipsVisit.home.payload,
      undefined,
      done,
    );
    expect([a.result, b.result]).toEqual(['ack', 'ack']);
  });

  it('finishes a trade whose second half failed, so it is never left on one farm', async () => {
    const { pip, kit, home, next } = await neighbours();
    await growMarigolds([
      { stub: home.stub, person: pip },
      { stub: next.stub, person: kit },
    ]);
    const real = ports.rules;
    // The visitor's farm can't write for a moment: its half fails after the visited farm's lands.
    ports.rules = {
      ...real,
      applyEvent: (state, event, lookup) => {
        if (event.kind === 'traded' && state.farm === next.farm) throw new Error('unavailable');
        return real.applyEvent(state, event, lookup);
      },
    };
    configureFarmPorts(ports);
    const trade = {
      opId: op(1),
      from: next.farm,
      with: pip.id,
      give: 'marigold',
      take: 'marigold',
    };
    expect((await api(kit, 'POST', `/v1/farms/${home.farm}/trade`, trade)).status).toBe(503);
    expect((await pageOf(next.stub, { limit: 1 })).events[0]).not.toMatchObject({ kind: 'traded' });
    ports.rules = real;
    configureFarmPorts(ports);
    ports.clock.advance(2 * 60_000);
    await runDurableObjectAlarm(home.stub);
    expect((await pageOf(next.stub, { limit: 1 })).events[0]).toMatchObject({
      kind: 'traded',
      actor: kit.id,
      opId: op(1),
    });
    expect(await hostOf(home.stub, (h) => h.store.tradeHalves())).toEqual([]);
  });
});

/** A returning account (email sign-in) that `person` signs in to from an anonymous install. */
const returningAccount = async () => {
  const email = `farm.${crypto.randomUUID().slice(0, 8)}@example.com`;
  const letters = watchLetters();
  await sendCode(email);
  const returning = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
  const mergeInto = async (anonymous: Person) => {
    await sendCode(email, { token: anonymous.token });
    await readSignIn(
      await signInWithCode(email, letters.codeFor(email), { token: anonymous.token }),
    );
    const job = {
      kind: 'person_merged',
      from: anonymous.id,
      into: returning.user.id,
      at: ports.clock.at,
    };
    await consumeDeletion(
      createMessageBatch('kithfield-deletion-dev', [
        { id: 'm1', timestamp: new Date(), attempts: 1, body: job },
      ]),
      env,
    );
  };
  return { id: returning.user.id, token: returning.token, mergeInto };
};

describe('merging people', () => {
  it('moves an anonymous person’s farms to the account they signed in to, and keeps their words theirs', async () => {
    const returning = await returningAccount();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    await stub.command(fig.id, { opId: op(1), kind: 'message', payload: { text: 'hello' } });
    const socket = await TestSocket.open(farm);
    await socket.hello(pip, farm, 4);

    await returning.mergeInto(fig);
    const into = returning.id;
    expect(await membership(farm, into)).toEqual({ role: 'critter', left_at: null });
    expect(await membership(farm, fig.id)).toBeNull();
    expect((await stub.state())?.members.map((m) => m.person)).toEqual([pip.id, into]);
    // Every phone says hello again, and one holding the farm from before the merge takes the moved snapshot.
    expect((await socket.waitClosed()).reason).toBe('unauthorized');
    const again = await TestSocket.open(farm);
    const caught = await again.hello(pip, farm, 4);
    expect(caught.snapshot?.state.members.map((m) => m.person)).toEqual([pip.id, into]);
    again.close();

    const edit = await stub.command(into, {
      opId: op(2),
      kind: 'edit',
      payload: { target: 4, text: 'hello!' },
    });
    expect(edit).toMatchObject({ result: 'ack', seq: 5 });
    const old = await stub.command(fig.id, { opId: op(3), kind: 'dewdrop', payload: {} });
    expect(old).toMatchObject({ result: 'ack' });
    expect((await pageOf(stub, { limit: 1 })).events[0]).toMatchObject({ actor: into });

    // Deleting the account tombstones what they wrote under either id.
    await stub.deleteAccount(into);
    const message = FarmEvent.parse((await pageOf(stub, { after: 3, limit: 1 })).events[0]);
    expect(message).toMatchObject({
      seq: 4,
      actor: fig.id,
      payload: { tombstone: 'author_deleted' },
    });
  });

  it('moves the farms they visited too, so a visited farm knows them by either id', async () => {
    const returning = await returningAccount();
    const { kit, home } = await neighbours();
    const wave = (who: { token: string }, n: number) =>
      api({ ...kit, token: who.token }, 'POST', `/v1/farms/${home.farm}/gate`, {
        opId: op(n),
        gesture: { gesture: 'wave' },
      });
    expect((await wave(kit, 1)).body).toMatchObject({ result: 'ack' });
    await returning.mergeInto(kit);
    const visitors = await env.DB.prepare('SELECT person_id FROM farm_visitors WHERE farm_id = ?')
      .bind(home.farm)
      .all();
    expect(visitors.results).toEqual([{ person_id: returning.id }]);
    // Their wave today was already made, under the old id.
    expect((await wave(returning, 2)).body).toMatchObject({
      result: 'rejected',
      reason: 'limit_reached',
    });
  });

  it('keeps the higher role when both people lived on the farm, so it never loses its keeper', async () => {
    const returning = await returningAccount();
    const { pip } = await cast('pip');
    const { farm, stub } = await plantFarm(pip);
    await stub.join(returning.id, { name: 'Wren', critter: critter('owl') }, true);
    await returning.mergeInto(pip);
    const members = (await stub.state())?.members.map((m) => [m.person, m.role]);
    expect(members).toEqual([[returning.id, 'keeper']]);
    expect(await membership(farm, returning.id)).toEqual({ role: 'keeper', left_at: null });
  });
});
