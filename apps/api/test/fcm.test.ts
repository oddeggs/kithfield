import type { PushJob } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cottageClock } from '../src/cottage/clock';
import { pushIdOf } from '../src/cottage/resting';
import { consumePush } from '../src/push/consumer';
import { EXPO_SEND_URL } from '../src/push/expo';
import {
  fcmAccessToken,
  fcmConfig,
  fcmSendUrl,
  fcmSilentMessage,
  forgetFcmToken,
  GOOGLE_TOKEN_URL,
  sendToFcm,
  serviceAccountJwt,
  type FcmConfig,
} from '../src/push/fcm';
import { androidChannelOf } from '../src/push/render';
import {
  cottageWithFarm,
  fakeExpoPushService,
  freshPerson,
  ledgerOf,
  okTickets,
  recordPushQueue,
  MIDDAY,
  useTestClock,
} from './cottage-doubles';

const PROJECT = 'kithfield-test';
const FCM_TOKEN = `fcm-${'a'.repeat(140)}`;

let keys: CryptoKeyPair;
let pem: string;

const base64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromUrl = (part: string) =>
  Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));

beforeAll(async () => {
  keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = base64(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
});

beforeEach(() => {
  useTestClock(MIDDAY);
  forgetFcmToken();
});

const serviceAccount = () =>
  JSON.stringify({
    type: 'service_account',
    project_id: PROJECT,
    client_email: 'push@kithfield-test.iam.gserviceaccount.com',
    private_key: pem,
    token_uri: GOOGLE_TOKEN_URL,
  });

const config = (): FcmConfig => fcmConfig({ FCM_SERVICE_ACCOUNT: serviceAccount() })!;

interface Call {
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
}

/** Google's token endpoint and FCM, answering as `fcm` says; every call is recorded. */
function fakeGoogle(fcm: (body: unknown, call: number) => Response) {
  const calls: Call[] = [];
  let sends = 0;
  let tokens = 0;
  const answer = (url: string, body: string): Response => {
    if (url === GOOGLE_TOKEN_URL) {
      tokens += 1;
      return Response.json({ access_token: `access-${tokens}`, expires_in: 3600 });
    }
    if (url === fcmSendUrl(PROJECT)) return fcm(JSON.parse(body), sends++);
    return okTickets(url, JSON.parse(body || '[]'));
  };
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, headers: new Headers(init?.headers), body });
    return Promise.resolve(answer(url, body));
  }) as typeof fetch;
  return { fetch: fetcher, calls };
}

const sent = () => Response.json({ name: `projects/${PROJECT}/messages/1` });

describe('the FCM service account', () => {
  it('reads the key and the project, and turns Android push off without a key', () => {
    expect(fcmConfig({})).toBeNull();
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT: 'not json' })).toBeNull();
    expect(config()).toMatchObject({ projectId: PROJECT, tokenUri: GOOGLE_TOKEN_URL });
    expect(
      fcmConfig({ FCM_SERVICE_ACCOUNT: serviceAccount(), FCM_PROJECT_ID: 'other' })?.projectId,
    ).toBe('other');
  });

  it('signs an RS256 assertion for FCM’s scope that the key’s public half verifies', async () => {
    const now = Date.parse(MIDDAY);
    const jwt = await serviceAccountJwt(config(), now);
    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(fromUrl(header)))).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(new TextDecoder().decode(fromUrl(claims)))).toEqual({
      iss: 'push@kithfield-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: GOOGLE_TOKEN_URL,
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keys.publicKey,
      fromUrl(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
  });

  it('mints one access token and reuses it until a minute before it runs out', async () => {
    const google = fakeGoogle(sent);
    const now = Date.parse(MIDDAY);
    expect(await fcmAccessToken(google.fetch, config(), now)).toBe('access-1');
    expect(await fcmAccessToken(google.fetch, config(), now + 58 * 60_000)).toBe('access-1');
    expect(await fcmAccessToken(google.fetch, config(), now + 59 * 60_000)).toBe('access-2');
    const asks = google.calls.filter((c) => c.url === GOOGLE_TOKEN_URL);
    expect(asks).toHaveLength(2);
    expect(new URLSearchParams(asks[0]!.body).get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );
  });

  it('renews a token FCM turns down once, then sends', async () => {
    const google = fakeGoogle((_body, call) =>
      call === 0 ? new Response('{}', { status: 401 }) : sent(),
    );
    const message = {
      message: { token: FCM_TOKEN, data: {}, android: { priority: 'HIGH' as const, ttl: '60s' } },
    };
    const result = await sendToFcm(google.fetch, config(), message, Date.parse(MIDDAY));
    expect(result).toEqual({ kind: 'ok', id: `projects/${PROJECT}/messages/1` });
    const sends = google.calls.filter((c) => c.url === fcmSendUrl(PROJECT));
    expect(sends.map((c) => c.headers.get('authorization'))).toEqual([
      'Bearer access-1',
      'Bearer access-2',
    ]);
  });

  it('tells a gone token from one worth retrying', async () => {
    const answer = (status: number, error: object) => () => Response.json({ error }, { status });
    const message = {
      message: { token: FCM_TOKEN, data: {}, android: { priority: 'HIGH' as const, ttl: '60s' } },
    };
    const send = (fcm: () => Response) =>
      sendToFcm(fakeGoogle(fcm).fetch, config(), message, Date.parse(MIDDAY));
    expect(
      await send(answer(404, { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] })),
    ).toMatchObject({ kind: 'gone', why: 'UNREGISTERED' });
    expect(
      await send(
        answer(400, {
          status: 'INVALID_ARGUMENT',
          message: 'The registration token is not a valid FCM registration token',
        }),
      ),
    ).toMatchObject({ kind: 'gone' });
    expect(await send(answer(429, { status: 'RESOURCE_EXHAUSTED' }))).toMatchObject({
      kind: 'retry',
    });
    expect(await send(answer(503, { status: 'UNAVAILABLE' }))).toMatchObject({ kind: 'retry' });
    expect(
      await send(answer(400, { status: 'INVALID_ARGUMENT', message: 'bad ttl' })),
    ).toMatchObject({ kind: 'refused' });
    expect(
      await send(answer(404, { status: 'NOT_FOUND', message: 'Requested entity was not found.' })),
    ).toMatchObject({ kind: 'refused', why: 'NOT_FOUND' });
    expect(
      await send(
        answer(403, {
          status: 'PERMISSION_DENIED',
          details: [{ errorCode: 'SENDER_ID_MISMATCH' }],
        }),
      ),
    ).toMatchObject({ kind: 'refused', why: 'SENDER_ID_MISMATCH' });
  });

  it('answers no access token, without throwing, for a key that isn’t one', async () => {
    const google = fakeGoogle(sent);
    const broken = {
      ...config(),
      privateKey: '-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----',
    };
    expect(await fcmAccessToken(google.fetch, broken, Date.parse(MIDDAY))).toBeNull();
    const message = {
      message: { token: FCM_TOKEN, data: {}, android: { priority: 'HIGH' as const, ttl: '60s' } },
    };
    expect(await sendToFcm(google.fetch, broken, message, Date.parse(MIDDAY))).toEqual({
      kind: 'retry',
      why: 'no_access_token',
    });
    expect(google.calls).toHaveLength(0);
  });
});

const jobFor = (person: string, over: Partial<PushJob> = {}): PushJob => ({
  person,
  farm: 'farm-a',
  kind: 'firefly',
  seq: 4,
  collapseKey: 'doorstep.20261018',
  copy: { key: 'push.doorstep.firefly', params: { name: 'Otis' } },
  forYou: true,
  at: cottageClock.now(),
  ...over,
});

async function consume(bodies: unknown[], fetcher: typeof fetch, secrets: object) {
  const batch = createMessageBatch(
    'kithfield-push-dev',
    bodies.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body })),
  );
  const ctx = createExecutionContext();
  await consumePush(batch, { ...env, ...secrets }, ctx, {
    fetch: fetcher,
    now: () => cottageClock.now(),
  });
  return (await getQueueResult(batch, ctx)) as unknown as {
    explicitAcks: string[];
    retryMessages: { msgId: string }[];
  };
}

async function personWithPhones() {
  const person = freshPerson();
  const cottage = await cottageWithFarm(person, 'farm-a');
  await cottage.registerDevice('pixel', {
    platform: 'android',
    name: 'June’s Pixel',
    pushToken: FCM_TOKEN,
    appVersion: '1.0.0 (1)',
  });
  await cottage.registerDevice('iphone', {
    platform: 'ios',
    name: 'June’s iPhone',
    pushToken: 'ExponentPushToken[june-phone]',
    appVersion: '1.0.0 (1)',
  });
  return { person, cottage };
}

describe('pushes to Android phones', () => {
  it('go to FCM as data messages the app draws, while iPhones still go through Expo', async () => {
    recordPushQueue();
    const { person } = await personWithPhones();
    const google = fakeGoogle(sent);
    const job = jobFor(person);
    const result = await consume([job], google.fetch, { FCM_SERVICE_ACCOUNT: serviceAccount() });
    expect(result.explicitAcks).toEqual(['m0']);

    const [fcm] = google.calls.filter((c) => c.url === fcmSendUrl(PROJECT));
    expect(fcm!.headers.get('authorization')).toBe('Bearer access-1');
    expect(JSON.parse(fcm!.body)).toEqual({
      message: {
        token: FCM_TOKEN,
        data: {
          title: 'The Thursday Lot',
          message: 'Otis left a firefly on your step. No reply needed.',
          body: JSON.stringify({ farm: 'farm-a', seq: 4, kind: 'firefly', push: pushIdOf(job) }),
          channelId: 'plans',
          tag: 'doorstep.20261018',
          threadIdentifier: 'farm-a',
          categoryId: 'tend',
        },
        android: { priority: 'HIGH', ttl: '86400s', collapse_key: 'doorstep.20261018' },
      },
    });
    const expo = google.calls.filter((c) => c.url === EXPO_SEND_URL);
    expect((JSON.parse(expo[0]!.body) as { to: string }[]).map((m) => m.to)).toEqual([
      'ExponentPushToken[june-phone]',
    ]);
    expect((await ledgerOf(person)).map((r) => [r['device'], r['decision']]).sort()).toEqual([
      ['iphone', 'sent'],
      ['pixel', 'sent'],
    ]);
  });

  it('drop a token FCM no longer knows, and book them failed while FCM isn’t set up', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhones();
    const gone = fakeGoogle(() =>
      Response.json(
        { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } },
        { status: 404 },
      ),
    );
    await consume([jobFor(person)], gone.fetch, { FCM_SERVICE_ACCOUNT: serviceAccount() });
    const pixel = (await cottage.listDevices()).find((d) => d.device === 'pixel');
    expect(pixel?.pushToken).toBeNull();

    const other = await personWithPhones();
    const expo = fakeExpoPushService(okTickets);
    const result = await consume([jobFor(other.person)], expo.fetch, {});
    expect(result.explicitAcks).toEqual(['m0']);
    expect(await ledgerOf(other.person)).toContainEqual(
      expect.objectContaining({ device: 'pixel', decision: 'failed', reason: 'fcm_unset' }),
    );
  });

  it('say who a push is from, so the app draws it as their message with their critter', async () => {
    recordPushQueue();
    const { person } = await personWithPhones();
    const google = fakeGoogle(sent);
    const job = jobFor(person, {
      copy: { key: 'push.doorstep.firefly', params: { name: 'Otis', from: 'otis' } },
    });
    await consume([job], google.fetch, { FCM_SERVICE_ACCOUNT: serviceAccount() });
    const [fcm] = google.calls.filter((c) => c.url === fcmSendUrl(PROJECT));
    const { data } = (JSON.parse(fcm!.body) as { message: { data: Record<string, string> } })
      .message;
    expect(data).toMatchObject({
      senderPerson: 'otis',
      senderName: 'Otis',
      message: 'Otis left a firefly on your step. No reply needed.',
    });
  });

  it('wake the widgets with a data-only message that shows nothing', () => {
    expect(
      fcmSilentMessage({
        to: FCM_TOKEN,
        data: { refresh: 'widgets', farm: 'farm-a', reason: 'fire' },
        _contentAvailable: true,
        priority: 'normal',
        collapseId: 'refresh.fire.farm-a',
        ttl: 3600,
      }),
    ).toEqual({
      message: {
        token: FCM_TOKEN,
        data: { body: '{"refresh":"widgets","farm":"farm-a","reason":"fire"}' },
        android: { priority: 'NORMAL', ttl: '3600s', collapse_key: 'refresh.fire.farm-a' },
      },
    });
  });

  it('arrive in one of the two channels, the roundup in Plans & doorstep', () => {
    const at = 0;
    const base = { person: 'p', farm: 'f', seq: 1, collapseKey: 'k', forYou: false, at };
    expect(
      androidChannelOf({ ...base, kind: 'message', copy: { key: 'push.mention', params: {} } }),
    ).toBe('messages');
    expect(
      androidChannelOf({
        ...base,
        forYou: true,
        kind: 'message',
        copy: { key: 'push.mention', params: {} },
      }),
    ).toBe('plans');
    expect(
      androidChannelOf({ ...base, kind: 'gift', copy: { key: 'push.doorstep.few', params: {} } }),
    ).toBe('plans');
  });
});
