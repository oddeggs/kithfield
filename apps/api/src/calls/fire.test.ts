import { FarmEvent, fireRoomOf, FireTokenResponse } from '@kithfield/contracts';
import { runDurableObjectAlarm } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { op, TestSocket } from '../../test/farm/support/client';
import {
  api,
  cast,
  pageOf,
  type Person,
  plantFarm,
  settled,
  type TestPorts,
  useTestPorts,
} from '../../test/farm/support/doubles';
import { setCaptionAudio, setCaptionPerks } from './captions';
import { answerRoomService, roomServiceCall } from './livekit-double.test-data';
import { fromBase64Url, sha256Base64, signJwt } from './jwt';

let ports: TestPorts;
let pip: Person;
let bea: Person;
let fig: Person;

/** What the room service was asked, by method, with each request's JSON. */
let asked: { method: string; body: Record<string, unknown> }[];
/** Who the room service says is in the room. */
let inRoom: { identity: string; attributes: Record<string, string> }[];

beforeEach(async () => {
  ports = useTestPorts();
  ({ pip, bea, fig } = await cast('pip', 'bea', 'fig'));
  asked = [];
  inRoom = [];
  // LiveKit's room service, stood in for: it answers as the real one does and records each call.
  const real = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const call = roomServiceCall(input, init);
    if (call === null) return real(input, init);
    asked.push(call);
    if (call.method === 'RemoveParticipant') return Response.json({});
    return answerRoomService(call, inRoom);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const claimsOf = (token: string) =>
  JSON.parse(new TextDecoder().decode(fromBase64Url(token.split('.')[1] ?? '') ?? undefined)) as {
    sub: string;
    video: Record<string, unknown>;
    attributes: Record<string, string>;
  };

/** A LiveKit webhook delivery, signed as LiveKit signs them. */
const hook = async (body: object, secret = env.LIVEKIT_API_SECRET ?? '') => {
  const raw = new TextEncoder().encode(JSON.stringify(body));
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    { iss: env.LIVEKIT_API_KEY, nbf: now, exp: now + 300, sha256: await sha256Base64(raw) },
    secret,
  );
  return exports.default.fetch('https://dev.kithfield.com/api/v1/webhooks/livekit', {
    method: 'POST',
    headers: { authorization: token, 'content-type': 'application/webhook+json' },
    body: raw,
  });
};

const participant = (event: string, farm: string, who: Person, at: number) => ({
  event,
  id: `EV_${event}_${at}`,
  createdAt: String(at),
  room: { name: fireRoomOf(farm), sid: 'RM_one' },
  participant: { identity: who.id, sid: `PA_${who.name}` },
});

describe('the fire token', () => {
  it('lets a listener hear but never publish, and someone joining in publish their mic', async () => {
    const { farm, stub } = await plantFarm(pip, [bea]);
    await stub.command(pip.id, { opId: op(1), kind: 'fire', payload: { state: 'lit' } });
    const listen = await api(pip, 'POST', `/v1/farms/${farm}/fire-token`, { mode: 'listen' });
    expect(listen.status).toBe(200);
    const issued = FireTokenResponse.parse(listen.body);
    expect(issued.room).toBe(fireRoomOf(farm));
    const claims = claimsOf(issued.token);
    expect(claims.sub).toBe(pip.id);
    expect(claims.video).toMatchObject({ room: fireRoomOf(farm), canPublish: false });
    expect(claims.attributes).toEqual({ mode: 'listen', captionsOk: 'no', lantern: 'off' });

    inRoom = [{ identity: pip.id, attributes: claims.attributes }];
    const join = await api(pip, 'POST', `/v1/farms/${farm}/fire-token`, { mode: 'join' });
    const joined = claimsOf(FireTokenResponse.parse(join.body).token);
    expect(joined.video).toMatchObject({ canPublish: true });
    // The listener already in the room may publish from now on, without reconnecting.
    expect(asked.find((a) => a.method === 'UpdateParticipant')?.body).toMatchObject({
      identity: pip.id,
      attributes: { mode: 'join' },
      permission: { canPublish: true },
    });
  });

  it('carries the speaker’s caption consent, and is only for people who live there', async () => {
    const { farm, stub } = await plantFarm(pip);
    await stub.command(pip.id, { opId: op(1), kind: 'fire', payload: { state: 'lit' } });
    await api(pip, 'PUT', '/v1/me/consents/captions', { allowed: true, textVersion: 'v1' });
    const mine = await api(pip, 'POST', `/v1/farms/${farm}/fire-token`, { mode: 'join' });
    expect(claimsOf(FireTokenResponse.parse(mine.body).token).attributes.captionsOk).toBe('yes');
    const stranger = await api(fig, 'POST', `/v1/farms/${farm}/fire-token`, { mode: 'join' });
    expect(stranger.status).toBe(404);
  });
});

describe('LiveKit’s webhook', () => {
  it('refuses a delivery that isn’t signed with the project’s secret', async () => {
    const { farm } = await plantFarm(pip);
    const forged = await hook(participant('participant_joined', farm, pip, 1), 'not-the-secret');
    expect(forged.status).toBe(401);
  });

  it('tells phones who is by the fire, and lets the fire go out 3 minutes after the last leaves', async () => {
    const { farm, stub } = await plantFarm(pip, [bea]);
    await stub.command(pip.id, { opId: op(1), kind: 'fire', payload: { state: 'lit' } });
    const socket = await TestSocket.open(farm);
    await socket.hello(bea, farm);
    expect(await socket.next('presence')).toMatchObject({ fire: [] });

    expect((await hook(participant('participant_joined', farm, pip, 100))).status).toBe(204);
    expect(await socket.next('presence')).toMatchObject({ fire: [pip.id] });
    await hook(participant('participant_joined', farm, bea, 101));
    expect(await socket.next('presence')).toMatchObject({ fire: [pip.id, bea.id] });

    // Someone sitting by the fire keeps it lit past the 3 minutes after lighting it.
    ports.clock.advance(10 * 60_000);
    await settled(stub);
    expect((await stub.state())?.fireLitAt).not.toBeNull();

    await hook(participant('participant_left', farm, pip, 102));
    expect(await socket.next('presence')).toMatchObject({ fire: [bea.id] });
    await hook(participant('participant_left', farm, bea, 103));
    expect(await socket.next('presence')).toMatchObject({ fire: [] });
    ports.clock.advance(3 * 60_000);
    await runDurableObjectAlarm(stub);
    const kinds = (await pageOf(stub, { after: 0 })).events.map((e) => FarmEvent.parse(e));
    expect(kinds.at(-1)).toMatchObject({ kind: 'fire', actor: null, payload: { state: 'out' } });
    socket.close();
  });

  it('acknowledges rooms that aren’t a farm’s fire and changes nothing', async () => {
    const other = await hook({
      event: 'room_started',
      id: 'EV_x',
      createdAt: '1',
      room: { name: 'somewhere-else', sid: 'RM_x' },
    });
    expect(other.status).toBe(204);
  });
});

describe('live captions', () => {
  const wav = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
  const send = (who: Person, farm: string, chunk = 0) =>
    exports.default.fetch(
      `https://dev.kithfield.com/api/v1/farms/${farm}/fire/captions?chunk=${chunk}&startedAt=1000`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${who.token}`, 'content-type': 'audio/wav' },
        body: wav,
      },
    );

  it('never takes the voice of someone who hasn’t said yes', async () => {
    const { farm } = await plantFarm(pip);
    expect((await send(pip, farm)).status).toBe(403);
  });

  it('captions a consenting speaker for each listener in their own language, and only them', async () => {
    const { farm } = await plantFarm(pip, [bea, fig]);
    await api(pip, 'PUT', '/v1/me/consents/captions', { allowed: true, textVersion: 'v1' });
    inRoom = [
      { identity: pip.id, attributes: { mode: 'join', captionsOk: 'yes', lantern: 'off' } },
      { identity: bea.id, attributes: { mode: 'listen', captionsOk: 'no', captionsIn: 'en' } },
      { identity: fig.id, attributes: { mode: 'join', captionsOk: 'no', captionsIn: 'vi' } },
    ];
    // With no speech model to hand, nobody is captioned and the phone stops sending.
    const unfilled = [setCaptionPerks(null), setCaptionAudio(null)];
    try {
      expect(await (await send(pip, farm)).json()).toEqual({ listening: false });
    } finally {
      for (const u of unfilled) u();
    }

    const undo = [
      setCaptionPerks((_env, person) => Promise.resolve(person !== fig.id)),
      setCaptionAudio((_env, _chunk, langs) =>
        Promise.resolve({
          said: 'vi',
          text: 'Thứ bảy mình mang bánh nhé',
          translations: Object.fromEntries(langs.map((l) => [l, `(${l}) cakes on Saturday`])),
        }),
      ),
    ];
    try {
      expect(await (await send(pip, farm, 3)).json()).toEqual({ listening: true });
      const sent = asked.filter((a) => a.method === 'SendData').map((a) => a.body);
      // Fig's perks are off, so only Bea hears, in English.
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ topic: 'captions', destinationIdentities: [bea.id] });
      const bytes = Uint8Array.from(atob(String(sent[0]?.['data'])), (ch) => ch.charCodeAt(0));
      const line = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      expect(line).toEqual({
        speaker: pip.id,
        chunk: 3,
        said: 'vi',
        text: 'Thứ bảy mình mang bánh nhé',
        translation: { lang: 'en', text: '(en) cakes on Saturday' },
      });
    } finally {
      for (const u of undo) u();
    }
  });
});
