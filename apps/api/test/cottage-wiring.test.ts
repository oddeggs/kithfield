import {
  CottageServerFrame,
  PROTOCOL_VERSION,
  RegisterDeviceResponse,
  RtTokenResponse,
} from '@kithfield/contracts';
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import { call, signInAnonymously } from '../src/auth/testing/client';
import { useProductionCottageAdapters } from '../src/cottage/adapters';
import { cottageOf } from '../src/cottage/stub';

/*
 * The cottage with real sign-in: sessions and socket tokens from auth, no doubles. Proves the
 * production wiring in `src/cottage/adapters.ts`.
 */

beforeAll(() => useProductionCottageAdapters());

const phone = {
  platform: 'ios',
  name: 'June’s iPhone',
  pushToken: 'ExponentPushToken[wiring]',
  appVersion: '1.0.0 (1)',
};

async function socketToken(token: string, farm?: string): Promise<string> {
  const response = await call('/v1/rt-token', { body: farm ? { farm } : {}, token });
  expect(response.status).toBe(200);
  return RtTokenResponse.parse(await response.json()).token;
}

/** Opens a person's cottage socket, says hello with a token, and answers the first frame. */
async function helloAnswer(person: string, token: string): Promise<unknown> {
  const response = await exports.default.fetch(
    `https://dev.kithfield.com/api/v1/cottage/${person}/socket`,
    { headers: { Upgrade: 'websocket' } },
  );
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  const first = new Promise<unknown>((resolve) => {
    ws.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))));
  });
  ws.accept();
  ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, token }));
  const frame = await first;
  ws.close(1000);
  return frame;
}

describe('the cottage with real sign-in', () => {
  it('registers a device for a signed-in person and turns away one without a session', async () => {
    const { token, user } = await signInAnonymously();
    const response = await call('/v1/devices/wiring-phone', { method: 'PUT', body: phone, token });
    expect(response.status).toBe(200);
    RegisterDeviceResponse.parse(await response.json());
    expect(await cottageOf(env, user.id).listDevices()).toEqual([
      expect.objectContaining({ device: 'wiring-phone', pushToken: phone.pushToken }),
    ]);

    const anonymous = await call('/v1/devices/wiring-phone', { method: 'PUT', body: phone });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: { code: 'unauthorized' } });
  });

  it('opens the cottage socket with a cottage token from auth', async () => {
    const { token, user } = await signInAnonymously();
    const frame = await helloAnswer(user.id, await socketToken(token));
    expect(CottageServerFrame.parse(frame)).toEqual({ type: 'chats', chats: [] });
  });

  it('refuses a farm token and another person’s token on the cottage socket', async () => {
    const june = await signInAnonymously();
    const bea = await signInAnonymously();
    const refused = { type: 'error', code: 'unauthorized' };
    expect(await helloAnswer(june.user.id, await socketToken(june.token, 'farm-a'))).toEqual(
      refused,
    );
    expect(await helloAnswer(june.user.id, await socketToken(bea.token))).toEqual(refused);
  });
});
