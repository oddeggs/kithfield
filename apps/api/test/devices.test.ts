import {
  CreateFarmResponse,
  DeviceList,
  PROTOCOL_VERSION,
  RtTokenResponse,
} from '@kithfield/contracts';
import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { readSignIn, sendCode, signInWithCode, watchLetters } from '../src/auth/testing/client';
import { TestSocket } from './farm/support/client';
import { api, type Person, useTestPorts } from './farm/support/doubles';
import { emailPerson } from './support/deletion';

beforeEach(() => {
  useTestPorts();
});

const DAY = 24 * 60 * 60_000;

/** One person signed in on two phones: two sessions, each with its own registered device. */
async function onTwoPhones() {
  const letters = watchLetters();
  const { email, person: phone } = await emailPerson(letters);
  await sendCode(email);
  const again = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
  const tablet: Person = { ...phone, token: again.token };
  const kitchen = crypto.randomUUID();
  const pocket = crypto.randomUUID();
  const register = (who: Person, id: string, name: string) =>
    api(who, 'PUT', `/v1/devices/${id}`, {
      platform: 'ios',
      name,
      pushToken: null,
      appVersion: '1.0.0',
    });
  expect((await register(phone, pocket, 'Wren’s iPhone')).status).toBe(200);
  expect((await register(tablet, kitchen, 'Kitchen iPad')).status).toBe(200);
  return { phone, tablet, pocket, kitchen };
}

const devicesOf = async (who: Person) => {
  const out = await api(who, 'GET', '/v1/devices');
  expect(out.status).toBe(200);
  return DeviceList.parse(out.body).devices;
};

/** The cottage socket, said hello to with a token from `who`'s session. */
async function cottageSocket(who: Person) {
  const issued = RtTokenResponse.parse((await api(who, 'POST', '/v1/rt-token', {})).body);
  const response = await exports.default.fetch(
    `https://dev.kithfield.com/api/v1/cottage/${who.id}/socket`,
    { headers: { Upgrade: 'websocket' } },
  );
  const ws = response.webSocket!;
  const heard: unknown[] = [];
  let closed: string | null = null;
  ws.addEventListener('message', (e) => heard.push(JSON.parse(String(e.data))));
  ws.addEventListener('close', (e) => {
    closed = e.reason;
  });
  ws.accept();
  ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, token: issued.token }));
  const wait = async (check: () => boolean) => {
    for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
    return check();
  };
  expect(await wait(() => heard.length > 0)).toBe(true);
  return { heard, closed: () => closed, wait };
}

describe('the person’s devices', () => {
  it('lists each signed-in device once, with the day it was last active and which one is asking', async () => {
    const { phone, tablet, pocket, kitchen } = await onTwoPhones();
    const seen = await devicesOf(phone);
    expect(seen.map((d) => [d.device, d.name, d.platform, d.current])).toEqual([
      [pocket, 'Wren’s iPhone', 'ios', true],
      [kitchen, 'Kitchen iPad', 'ios', false],
    ]);
    for (const d of seen) expect(d.lastActiveAt % DAY).toBe(0);
    expect((await devicesOf(tablet)).find((d) => d.current)?.device).toBe(kitchen);
    expect((await api(null, 'GET', '/v1/devices')).status).toBe(401);
  });

  it('signs a device out from another: its session ends and its sockets hear session_ended', async () => {
    const { phone, tablet, kitchen } = await onTwoPhones();
    const created = await api(phone, 'POST', '/v1/farms', {
      name: 'The Thursday Lot',
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    const { farm } = CreateFarmResponse.parse(created.body);
    const farmSocket = await TestSocket.open(farm);
    expect((await farmSocket.hello(tablet, farm)).error).toBeNull();
    const stayed = await TestSocket.open(farm);
    expect((await stayed.hello(phone, farm)).error).toBeNull();
    const cottage = await cottageSocket(tablet);

    expect((await api(phone, 'DELETE', `/v1/devices/${kitchen}`)).status).toBe(204);
    expect(await farmSocket.next('error')).toEqual({ type: 'error', code: 'session_ended' });
    expect((await farmSocket.waitClosed()).reason).toBe('session_ended');
    expect(await cottage.wait(() => cottage.closed() === 'session_ended')).toBe(true);
    expect(cottage.heard).toContainEqual({ type: 'error', code: 'session_ended' });
    // The other phone stays signed in and connected.
    expect(stayed.closed).toBeNull();
    expect((await api(phone, 'GET', '/v1/me')).status).toBe(200);
    // The ended session can't call the API or open a socket with a token it already holds.
    expect((await api(tablet, 'GET', '/v1/me')).status).toBe(401);
    expect((await devicesOf(phone)).map((d) => d.device)).not.toContain(kitchen);
    const rows = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM device_action_keys WHERE device_id = ?',
    )
      .bind(kitchen)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
    // Signing out a device again, or one that isn't the person's, finds nothing.
    expect((await api(phone, 'DELETE', `/v1/devices/${kitchen}`)).status).toBe(404);
    farmSocket.close();
    stayed.close();
  });

  it('turns away a socket token minted under a session that has since ended', async () => {
    const { phone, tablet, kitchen } = await onTwoPhones();
    const created = await api(phone, 'POST', '/v1/farms', {
      name: 'The Thursday Lot',
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    const { farm } = CreateFarmResponse.parse(created.body);
    const issued = RtTokenResponse.parse(
      (await api(tablet, 'POST', '/v1/rt-token', { farm })).body,
    );
    expect((await api(phone, 'DELETE', `/v1/devices/${kitchen}`)).status).toBe(204);
    const socket = await TestSocket.open(farm);
    socket.send({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      token: issued.token,
      lastSeq: 0,
      rulesVersion: 1,
    });
    expect(await socket.next('error')).toEqual({ type: 'error', code: 'unauthorized' });
  });
});
