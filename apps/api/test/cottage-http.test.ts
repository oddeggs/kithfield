import { RegisterDeviceResponse } from '@kithfield/contracts';
import { runDurableObjectAlarm } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTION_KEY_HEADER,
  type ActionKeyVariables,
  requireActionKey,
} from '../src/cottage/action-key';
import { cottageClock } from '../src/cottage/clock';
import { cottageOf } from '../src/cottage/stub';
import type { Bindings } from '../src/env';
import {
  freshPerson,
  ledgerOf,
  MIDDAY,
  useTestClock,
  recordPushQueue,
  testSession,
  useTestSignInDouble,
} from './cottage-doubles';

const hibernations: [string, boolean][] = [];
beforeAll(() => useTestSignInDouble((person, on) => hibernations.push([person, on])));
beforeEach(() => {
  useTestClock(MIDDAY);
});

const api = (path: string, init: RequestInit = {}) =>
  exports.default.fetch(`https://dev.kithfield.com/api${path}`, init);

const json = (person: string, method: string, body: unknown): RequestInit => ({
  method,
  headers: { ...testSession(person), 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const phone = {
  platform: 'ios',
  name: 'June’s iPhone',
  pushToken: 'ExponentPushToken[abc]',
  appVersion: '1.0.0 (1)',
};

/** A route behind the action key, as the share extension and notification replies reach one. */
const keyed = new Hono<{ Bindings: Bindings; Variables: ActionKeyVariables }>().post(
  '/reply',
  requireActionKey(),
  (c) => c.json({ person: c.get('actionPerson'), device: c.get('actionDevice') }),
);
const reply = (key: string | null) =>
  keyed.request(
    '/reply',
    { method: 'POST', headers: key === null ? {} : { [ACTION_KEY_HEADER]: key } },
    env,
  );

describe('device registration', () => {
  it('needs a session', async () => {
    const response = await api('/v1/devices/phone-1', { method: 'PUT', body: '{}' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized' } });
  });

  it('stores the device in the cottage and answers with an action key that opens keyed routes', async () => {
    const person = freshPerson();
    const response = await api('/v1/devices/phone-1', json(person, 'PUT', phone));
    expect(response.status).toBe(200);
    const { actionKey } = RegisterDeviceResponse.parse(await response.json());

    expect(await cottageOf(env, person).listDevices()).toEqual([
      expect.objectContaining({ device: 'phone-1', platform: 'ios', pushToken: phone.pushToken }),
    ]);
    const ok = await reply(actionKey);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ person, device: 'phone-1' });
    expect((await reply(null)).status).toBe(401);
    expect((await reply(`${actionKey}x`)).status).toBe(401);
    expect((await reply('short')).status).toBe(401);
  });

  it('rotates the key when the device registers again', async () => {
    const person = freshPerson();
    const first = await (
      await api('/v1/devices/phone-1', json(person, 'PUT', phone))
    ).json<{ actionKey: string }>();
    const second = await (
      await api('/v1/devices/phone-1', json(person, 'PUT', phone))
    ).json<{ actionKey: string }>();
    expect(second.actionKey).not.toBe(first.actionKey);
    expect((await reply(first.actionKey)).status).toBe(401);
    expect((await reply(second.actionKey)).status).toBe(200);
  });

  it('moves a phone that signs in as someone else out of the first person’s cottage', async () => {
    const june = freshPerson('june');
    const bea = freshPerson('bea');
    const device = `shared-${june}`;
    await api(`/v1/devices/${device}`, json(june, 'PUT', phone));
    await api(`/v1/devices/${device}`, json(bea, 'PUT', phone));
    expect(await cottageOf(env, june).listDevices()).toEqual([]);
    expect(await cottageOf(env, bea).listDevices()).toHaveLength(1);
  });

  it('turns away a push token that is not an Expo one', async () => {
    const person = freshPerson();
    const response = await api(
      '/v1/devices/phone-1',
      json(person, 'PUT', { ...phone, pushToken: 'apns-raw-hex' }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'bad_request', fields: ['pushToken'] },
    });
  });

  it('gives a push token to one person only: the last to register it', async () => {
    const june = freshPerson('june');
    const bea = freshPerson('bea');
    const token = { ...phone, pushToken: `ExponentPushToken[${june}]` };
    await api('/v1/devices/june-phone', json(june, 'PUT', token));
    await api('/v1/devices/bea-phone', json(bea, 'PUT', token));
    expect(await cottageOf(env, june).listDevices()).toEqual([
      expect.objectContaining({ device: 'june-phone', pushToken: null }),
    ]);
    expect(await cottageOf(env, bea).listDevices()).toEqual([
      expect.objectContaining({ device: 'bea-phone', pushToken: token.pushToken }),
    ]);
  });

  it('turns a bad body or device id away with the fields that failed', async () => {
    const person = freshPerson();
    const response = await api(
      '/v1/devices/phone-1',
      json(person, 'PUT', { ...phone, platform: 'tv' }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'bad_request', fields: ['platform'] } });
    expect((await api('/v1/devices/no%20spaces', json(person, 'PUT', phone))).status).toBe(400);
  });
});

describe('settings and hibernating', () => {
  it('changes the settings kept in the cottage', async () => {
    const person = freshPerson();
    const response = await api(
      '/v1/me/settings',
      json(person, 'PATCH', { lang: 'vi', nudges: 'off' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      lang: 'vi',
      nudges: 'off',
      backOffWhenQuiet: true,
    });
    expect((await cottageOf(env, person).settings()).settings.lang).toBe('vi');
    expect((await api('/v1/me/settings', json(person, 'PATCH', {}))).status).toBe(400);
  });

  it('hibernates, and hands it to the farms every time, so a failed fan-out can be retried', async () => {
    const person = freshPerson();
    expect((await api('/v1/me/hibernate', json(person, 'PUT', { on: true }))).status).toBe(204);
    expect((await api('/v1/me/hibernate', json(person, 'PUT', { on: true }))).status).toBe(204);
    expect((await cottageOf(env, person).settings()).hibernating).toBe(true);
    expect(hibernations.filter(([p]) => p === person)).toEqual([
      [person, true],
      [person, true],
    ]);
  });

  it('starts with no quiet hours of its own and friends free to draw it into stickers', async () => {
    const { settings } = await cottageOf(env, freshPerson()).settings();
    expect(settings).toMatchObject({ quietHours: null, inTogetherStickers: true });
  });
});

describe('remember-me seeds', () => {
  const seed = (nudgeAt: number) => ({
    farm: 'farm-a',
    fromSeq: 12,
    about: 'bea',
    title: 'Bea’s interview, Thursday',
    nudgeAt,
  });

  it('plants, lists and removes seeds', async () => {
    const person = freshPerson();
    const later = cottageClock.now() + 86_400_000;
    const planted = await api('/v1/remember', json(person, 'POST', seed(later)));
    expect(planted.status).toBe(201);
    const { id } = await planted.json<{ id: string }>();

    const listed = await api('/v1/remember', { headers: testSession(person) });
    expect(await listed.json()).toEqual({
      seeds: [{ id, ...seed(later), createdAt: expect.any(Number) as number }],
    });
    // Someone else's list is their own.
    const other = await api('/v1/remember', { headers: testSession(freshPerson()) });
    expect(await other.json()).toEqual({ seeds: [] });

    expect(
      (await api(`/v1/remember/${id}`, { method: 'DELETE', headers: testSession(person) })).status,
    ).toBe(204);
    expect(
      (await api(`/v1/remember/${id}`, { method: 'DELETE', headers: testSession(person) })).status,
    ).toBe(404);
    expect((await api('/v1/remember', json(person, 'POST', { title: 'x' }))).status).toBe(400);
  });

  it('nudges from the cottage’s alarm at its time, and the seed leaves the list', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = cottageOf(env, person);
    await api('/v1/remember', json(person, 'POST', seed(cottageClock.now() + 86_400_000)));
    // Not due yet: the alarm rings early here and nudges nothing.
    expect(await runDurableObjectAlarm(cottage)).toBe(true);
    expect(queue.jobs()).toEqual([]);
    expect(await cottage.listSeeds()).toHaveLength(1);

    // Due in a moment: the cottage's own alarm rings at its time.
    await cottage.removeSeed((await cottage.listSeeds())[0]!.id);
    await api('/v1/remember', json(person, 'POST', seed(cottageClock.now() + 200)));
    await vi.waitFor(() => expect(queue.jobs()).toHaveLength(1), { timeout: 5_000 });
    expect(queue.jobs()).toEqual([
      expect.objectContaining({
        person,
        farm: 'farm-a',
        kind: 'remember',
        seq: 12,
        copy: { key: 'push.remember', params: { title: 'Bea’s interview, Thursday' } },
      }),
    ]);
    expect(await cottage.listSeeds()).toEqual([]);
    expect(await ledgerOf(person)).toEqual([
      expect.objectContaining({ kind: 'remember', decision: 'queued' }),
    ]);
  });

  it('keeps quiet for a hibernating person', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = cottageOf(env, person);
    await cottage.setHibernating(true);
    await cottage.plantSeed(seed(cottageClock.now() + 100));
    await vi.waitFor(async () => expect(await ledgerOf(person)).toHaveLength(1), {
      timeout: 5_000,
    });
    expect(queue.jobs()).toEqual([]);
    expect((await ledgerOf(person))[0]).toMatchObject({
      decision: 'skipped',
      reason: 'hibernating',
    });
  });
});
