import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { cottageOf } from '../src/cottage/stub';
import { api, newPerson, useTestPorts } from './farm/support/doubles';

beforeEach(() => {
  useTestPorts();
});

const TOKEN = 'ab'.repeat(32);
const OTHER = 'cd'.repeat(40);

async function personWithPhone() {
  const person = await newPerson('wren');
  const device = crypto.randomUUID();
  const registered = await api(person, 'PUT', `/v1/devices/${device}`, {
    platform: 'ios',
    name: 'Wren’s iPhone',
    pushToken: null,
    appVersion: '1.0.0',
  });
  expect(registered.status).toBe(200);
  return { person, device };
}

const tokensOf = (person: string) =>
  runInCottage(person, (sql) => ({
    start: sql.exec('SELECT device, token FROM activity_start_tokens').toArray(),
    running: sql
      .exec('SELECT device, activity, farm, seed, token FROM activity_tokens ORDER BY activity')
      .toArray(),
  }));

async function runInCottage<T>(person: string, read: (sql: SqlStorage) => T): Promise<T> {
  const stub = env.COTTAGE.get(env.COTTAGE.idFromName(person));
  return runInDurableObject(stub, (_instance, state) => read(state.storage.sql));
}

describe('Live Activity tokens', () => {
  it('keeps the push-to-start token and each running activity’s token, per device', async () => {
    const { person, device } = await personWithPhone();
    const base = `/v1/devices/${device}`;
    expect((await api(person, 'PUT', `${base}/activity-start`, { token: TOKEN })).status).toBe(204);
    const plan = { activity: 'plan_day', farm: 'farm-a', seed: 30, token: TOKEN };
    expect((await api(person, 'PUT', `${base}/activities`, plan)).status).toBe(204);
    const fire = { activity: 'fire', farm: 'farm-a', token: OTHER };
    expect((await api(person, 'PUT', `${base}/activities`, fire)).status).toBe(204);
    expect(await tokensOf(person.id)).toEqual({
      start: [{ device, token: TOKEN }],
      running: [
        { device, activity: 'fire', farm: 'farm-a', seed: 0, token: OTHER },
        { device, activity: 'plan_day', farm: 'farm-a', seed: 30, token: TOKEN },
      ],
    });

    // The activity ended: its token goes, named without it.
    const ended = { activity: 'plan_day', farm: 'farm-a', seed: 30 };
    expect((await api(person, 'DELETE', `${base}/activities`, ended)).status).toBe(204);
    expect((await tokensOf(person.id)).running).toEqual([
      { device, activity: 'fire', farm: 'farm-a', seed: 0, token: OTHER },
    ]);
  });

  it('refuses a device that isn’t the person’s, and a token that isn’t hex', async () => {
    const { person, device } = await personWithPhone();
    const stranger = crypto.randomUUID();
    expect(
      (await api(person, 'PUT', `/v1/devices/${stranger}/activity-start`, { token: TOKEN })).status,
    ).toBe(404);
    expect(
      (await api(person, 'PUT', `/v1/devices/${device}/activity-start`, { token: 'not-hex' }))
        .status,
    ).toBe(400);
    expect(
      (await api(null, 'PUT', `/v1/devices/${device}/activity-start`, { token: TOKEN })).status,
    ).toBe(401);
  });

  it('lets the tokens go with the device', async () => {
    const { person, device } = await personWithPhone();
    await api(person, 'PUT', `/v1/devices/${device}/activity-start`, { token: TOKEN });
    await api(person, 'PUT', `/v1/devices/${device}/activities`, {
      activity: 'fire',
      farm: 'farm-a',
      token: OTHER,
    });
    await cottageOf(env, person.id).forgetDevice(device);
    expect(await tokensOf(person.id)).toEqual({ start: [], running: [] });
  });
});
