import {
  CreateFarmResponse,
  FarmEvent,
  FarmGate,
  InvitePreview,
  WaitingList,
} from '@kithfield/contracts';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { op } from './support/client';
import { as, farmStub, plantFarm, PROFILES, type TestPorts, useTestPorts } from './support/doubles';

let ports: TestPorts;
beforeEach(() => {
  ports = useTestPorts();
});

const call = async (method: string, path: string, person: string | null, body?: unknown) => {
  const response = await exports.default.fetch(`https://dev.kithfield.com/api/v1${path}`, {
    method,
    headers: { ...(person === null ? {} : as(person)), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as unknown };
};

const roleIn = (farm: string, person: string) =>
  env.DB.prepare('SELECT role, left_at FROM memberships WHERE farm_id = ? AND person_id = ?')
    .bind(farm, person)
    .first();

const plant = async () => {
  const created = await call('POST', '/farms', 'pip', {
    name: 'The Thursday Lot',
    land: 'meadow',
    timeZone: 'Europe/London',
    hemisphere: 'north',
  });
  expect(created.status).toBe(201);
  return CreateFarmResponse.parse(created.body);
};

const codeOf = (url: string) => url.split('/i/')[1]!;

describe('planting and joining', () => {
  it('plants a farm with its keeper, in the log and in D1, with an invite link', async () => {
    const { farm, invite } = await plant();
    expect(invite.url).toBe(`https://dev.kithfield.com/i/${invite.code}`);
    expect(await roleIn(farm, 'pip')).toEqual({ role: 'keeper', left_at: null });
    const events = (await farmStub(farm).page({ limit: 10 })).events.map((e) => FarmEvent.parse(e));
    expect(events.map((e) => [e.seq, e.kind, e.actor])).toEqual([
      [1, 'farm_created', null],
      [2, 'joined', 'pip'],
    ]);
    expect(events[0]?.payload).toEqual({
      farm,
      kind: 'farm',
      name: 'The Thursday Lot',
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    expect((await call('POST', '/farms', null, {})).status).toBe(401);
  });

  it('previews an invite publicly and joins through it', async () => {
    const { farm, invite } = await plant();
    const preview = InvitePreview.parse((await call('GET', `/invites/${invite.code}`, null)).body);
    expect(preview).toEqual({
      name: 'The Thursday Lot',
      land: 'meadow',
      critters: [PROFILES['pip']!.critter],
      full: false,
      approval: false,
    });
    const joined = await call('POST', `/invites/${invite.code}/join`, 'fig', PROFILES['fig']);
    expect(joined).toEqual({ status: 200, body: { farm, status: 'joined' } });
    expect(await roleIn(farm, 'fig')).toEqual({ role: 'critter', left_at: null });
    expect((await call('GET', '/invites/nope1234', null)).body).toEqual({
      error: { code: 'invite_invalid' },
    });
  });

  it('retires the old link when a keeper or helper makes a new one', async () => {
    const { farm, invite } = await plant();
    await call('POST', `/invites/${invite.code}/join`, 'fig', PROFILES['fig']);
    expect((await call('POST', `/farms/${farm}/invites`, 'fig', { expiresAt: null })).status).toBe(
      403,
    );
    const fresh = await call('POST', `/farms/${farm}/invites`, 'pip', {
      expiresAt: ports.clock.at + 1,
    });
    expect(fresh.status).toBe(201);
    expect((await call('GET', `/invites/${invite.code}`, null)).status).toBe(404);
    expect(
      (await call('GET', `/invites/${codeOf((fresh.body as { url: string }).url)}`, null)).status,
    ).toBe(200);
  });

  it('keeps people waiting where the keeper lets them in, and lets them in or not, quietly', async () => {
    const { farm, invite } = await plant();
    await farmStub(farm).command('pip', {
      opId: op(1),
      kind: 'settings_changed',
      payload: { setting: 'approval', on: true },
    });
    expect(
      (await call('POST', `/invites/${invite.code}/join`, 'kit', PROFILES['kit'])).body,
    ).toEqual({ farm, status: 'waiting_for_keeper' });
    expect(
      (await call('POST', `/invites/${invite.code}/join`, 'bea', PROFILES['bea'])).body,
    ).toMatchObject({ status: 'waiting_for_keeper' });
    const waiting = WaitingList.parse(
      (await call('GET', `/farms/${farm}/waiting`, 'pip')).body,
    ).waiting;
    expect(waiting.map((w) => [w.person, w.name])).toEqual([
      ['kit', 'Kit'],
      ['bea', 'Bea'],
    ]);
    expect(
      (await call('POST', `/farms/${farm}/waiting/kit`, 'pip', { approve: true })).status,
    ).toBe(204);
    expect(
      (await call('POST', `/farms/${farm}/waiting/bea`, 'pip', { approve: false })).status,
    ).toBe(204);
    expect(await roleIn(farm, 'kit')).toMatchObject({ role: 'critter' });
    expect(await roleIn(farm, 'bea')).toBeNull();
    expect(
      WaitingList.parse((await call('GET', `/farms/${farm}/waiting`, 'pip')).body).waiting,
    ).toEqual([]);
    expect((await call('GET', `/farms/${farm}/waiting`, 'kit')).status).toBe(403);
  });
});

describe('visits', () => {
  it('opens one visit per pair of people, and finds it again from either side', async () => {
    const opened = await call('POST', '/visits', 'pip', {
      person: 'fig',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    expect(opened.status).toBe(201);
    const { farm } = opened.body as { farm: string };
    expect(
      (
        await call('POST', '/visits', 'fig', {
          person: 'pip',
          timeZone: 'Asia/Ho_Chi_Minh',
          hemisphere: 'north',
        })
      ).body,
    ).toEqual({ farm });
    const state = await farmStub(farm).state();
    expect(state).toMatchObject({ kind: 'visit', name: null, land: 'porch' });
    expect(state?.members.map((m) => m.person)).toEqual(['pip', 'fig']);
    expect((await call('POST', `/farms/${farm}/invites`, 'pip', { expiresAt: null })).status).toBe(
      403,
    );
    expect(
      (
        await call('POST', '/visits', 'pip', {
          person: 'pip',
          timeZone: 'UTC',
          hemisphere: 'north',
        })
      ).status,
    ).toBe(400);
  });
});

describe('the gate', () => {
  it('shows visitors the farm, never its chat, and takes their gestures', async () => {
    const { farm } = await plantFarm(['fig']);
    const gate = FarmGate.parse((await call('GET', `/farms/${farm}/gate`, 'kit')).body);
    expect(gate.critters.map((c) => c.name)).toEqual(['Pip', 'Fig']);
    const firefly = {
      opId: op(1),
      gesture: { gesture: 'firefly', to: 'fig', words: 'hello from next door' },
    };
    expect((await call('POST', `/farms/${farm}/gate`, 'kit', firefly)).body).toEqual({
      result: 'ack',
      opId: op(1),
      seq: 4,
    });
    const lost = { opId: op(2), gesture: { gesture: 'firefly', to: 'nobody' } };
    expect((await call('POST', `/farms/${farm}/gate`, 'kit', lost)).body).toMatchObject({
      result: 'rejected',
      reason: 'not_found',
    });
    expect(
      (
        await call('POST', `/farms/${farm}/gate`, 'fig', {
          opId: op(3),
          gesture: { gesture: 'wave' },
        })
      ).body,
    ).toMatchObject({ reason: 'not_allowed' });
    const event = FarmEvent.parse((await farmStub(farm).page({ after: 3, limit: 1 })).events[0]);
    expect(event).toMatchObject({
      kind: 'gate',
      actor: 'kit',
      payload: { visitor: PROFILES['kit'], gesture: firefly.gesture },
    });
  });
});

describe('trading', () => {
  it('writes the swap on both farms, each with its own trader, once a season', async () => {
    const home = await plantFarm([]);
    const away = await plantFarm(['kit'], {
      keeper: 'mo',
      members: [{ person: 'mo', profile: PROFILES['mo']!, via: 'created' }],
    });
    for (const { stub } of [home, away]) {
      ports.clock.at = (await runInDurableObject(stub, (_f, s) => s.storage.getAlarm())) ?? 0;
      await runDurableObjectAlarm(stub);
    }
    const trade = { opId: op(1), from: away.farm, with: 'pip', give: 'pumpkin', take: 'pumpkin' };
    const first = await call('POST', `/farms/${home.farm}/trade`, 'kit', trade);
    expect(first.body).toEqual({ result: 'ack', opId: op(1), seq: 5 });
    expect((await call('POST', `/farms/${home.farm}/trade`, 'kit', trade)).body).toEqual(
      first.body,
    );
    const crop = { plant: 'pumpkin', variant: null };
    const last = async (stub: typeof home.stub) =>
      FarmEvent.parse((await stub.page({ limit: 1 })).events[0]);
    expect(await last(home.stub)).toMatchObject({
      kind: 'traded',
      actor: 'pip',
      payload: { with: 'kit', otherFarm: away.farm, gave: crop, got: crop },
    });
    expect(await last(away.stub)).toMatchObject({
      kind: 'traded',
      actor: 'kit',
      payload: { with: 'pip', otherFarm: home.farm },
    });
    const again = await call('POST', `/farms/${home.farm}/trade`, 'kit', { ...trade, opId: op(2) });
    expect(again.body).toMatchObject({ result: 'rejected', reason: 'limit_reached' });
    expect(
      (await call('POST', `/farms/${home.farm}/trade`, 'fig', { ...trade, opId: op(3) })).status,
    ).toBe(403);
  });
});
