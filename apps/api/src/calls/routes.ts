import {
  FIRE_CAPTION_TOPIC,
  FireCaptionChunkQuery,
  type FireCaptionChunkResponse,
  type FireAttributes,
  fireRoomOf,
  FireTokenRequest,
  type FireTokenResponse,
  LIMITS,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { body, fail, farmStub, member, signedIn } from '../farm/http';
import {
  caption,
  captionsAllowed,
  captionsAvailable,
  linesFor,
  listenersIn,
  withPerks,
} from './captions';
import {
  letJoinIn,
  listParticipants,
  liveKitOf,
  ROOM_TOKEN_TTL_S,
  roomToken,
  sendData,
} from './livekit';
import { fireRoomEvent, verifiedBody } from './webhook';

/*
 * The fire room's routes, mounted at `/v1`:
 * - `POST /farms/:id/fire-token`: a LiveKit token for the farm's fire room (members only).
 * - `POST /farms/:id/fire/captions`: one piece of a consenting speaker's audio, captioned for
 *   whoever has captions on.
 * - `POST /webhooks/livekit`: LiveKit's room events, which tell the farm who is by the fire.
 * No route here ever sends a push: lighting the fire rings nobody.
 */

const AUDIO_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/m4a']);

const seconds = (ms: number) => Math.floor(ms / 1000);

export const callsRoutes = (): Hono<SessionEnv> => {
  const app = new Hono<SessionEnv>();

  app.post('/farms/:id/fire-token', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const req = await body(c, FireTokenRequest);
    if (req instanceof Response) return req;
    const lk = liveKitOf(c.env);
    if (lk === null) return fail(c, 503, 'unavailable');
    // Nobody sits by a fire that is out: it is lit first (`fire {lit}`), then sat by.
    const state = await farmStub(c.env, m.farm).state();
    if (state?.fireLitAt == null) return fail(c, 409, 'conflict');
    const now = Date.now();
    const room = fireRoomOf(m.farm);
    const attributes: FireAttributes = {
      mode: req.mode,
      captionsOk: (await captionsAllowed(c.env.DB, m.person)) ? 'yes' : 'no',
      lantern: 'off',
    };
    const token = await roomToken(lk, m.person, room, attributes, seconds(now));
    // A listener joining in keeps their seat: the room lets them publish without reconnecting.
    if (req.mode === 'join') await letJoinIn(lk, room, m.person, seconds(now));
    const answer: FireTokenResponse = {
      url: lk.url,
      room,
      token,
      expiresAt: now + ROOM_TOKEN_TTL_S * 1000,
      captionsAvailable: captionsAvailable(),
    };
    return c.json(answer);
  });

  app.post('/farms/:id/fire/captions', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const query = FireCaptionChunkQuery.safeParse(c.req.query());
    if (!query.success) return fail(c, 400, 'bad_request', ['chunk', 'startedAt']);
    const type = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!AUDIO_TYPES.has(type)) return fail(c, 400, 'bad_request', ['body']);
    // The length comes first, so a body is never read without knowing how big it is.
    const length = c.req.header('content-length');
    if (length === undefined || !/^\d{1,9}$/.test(length))
      return fail(c, 400, 'bad_request', ['content-length']);
    if (Number(length) > LIMITS.captionChunkBytes) return fail(c, 413, 'too_large');
    if (!(await c.env.FIRE_LIMIT.limit({ key: m.person })).success)
      return fail(c, 429, 'rate_limited');
    if (!(await captionsAllowed(c.env.DB, m.person))) return fail(c, 403, 'forbidden');
    const lk = liveKitOf(c.env);
    if (lk === null) return c.json({ listening: false } satisfies FireCaptionChunkResponse);
    const room = fireRoomOf(m.farm);
    const now = seconds(Date.now());
    const participants = await listParticipants(lk, room, now);
    // Only someone joined in the room speaks: never a listener, nor anyone not by the fire.
    const speaker = participants.find((p) => p.identity === m.person);
    if (speaker?.attributes['mode'] !== 'join') return fail(c, 403, 'forbidden');
    const audio = new Uint8Array(await c.req.arrayBuffer());
    if (audio.byteLength > LIMITS.captionChunkBytes) return fail(c, 413, 'too_large');
    const listeners = await withPerks(c.env, listenersIn(participants));
    if (listeners.length === 0 || audio.byteLength === 0) {
      return c.json({ listening: listeners.length > 0 } satisfies FireCaptionChunkResponse);
    }
    const langs = listeners.map((l) => l.lang);
    const heard = await caption(c.env, audio, langs);
    if (heard === null) return c.json({ listening: false } satisfies FireCaptionChunkResponse);
    if (heard.text !== '') {
      const encoder = new TextEncoder();
      const lines = linesFor(m.person, query.data.chunk, heard, langs);
      await Promise.all(
        [...lines].map(([lang, line]) =>
          sendData(
            lk,
            room,
            FIRE_CAPTION_TOPIC,
            encoder.encode(JSON.stringify(line)),
            listeners.filter((l) => l.lang === lang).map((l) => l.person),
            now,
          ),
        ),
      );
    }
    return c.json({ listening: true } satisfies FireCaptionChunkResponse);
  });

  app.post('/webhooks/livekit', async (c) => {
    const lk = liveKitOf(c.env);
    if (lk === null) return fail(c, 503, 'unavailable');
    const raw = new Uint8Array(await c.req.arrayBuffer());
    const verified = await verifiedBody(
      lk,
      c.req.header('authorization'),
      raw,
      seconds(Date.now()),
    );
    if (verified === undefined) return fail(c, 401, 'unauthorized');
    const fire = fireRoomEvent(verified);
    // Other rooms and other events are acknowledged and left alone, so LiveKit never retries them.
    if (fire !== null) await farmStub(c.env, fire.farm).fireRoomEvent(fire.event);
    return c.body(null, 204);
  });

  return app;
};
