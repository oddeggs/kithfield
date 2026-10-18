import type { FireAttributes, FireRoom, PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { signJwt, toBase64 } from './jwt';

/*
 * LiveKit, as the fire room uses it: room tokens for phones, and the few room-service calls the
 * API makes itself (a listener who joins in, who has captions on, sending caption lines). The
 * room service is LiveKit's Twirp API over HTTPS on the same host as the room's WebSocket URL.
 */

export type LiveKitConfig = { url: string; key: string; secret: string };

/** LiveKit's settings for this environment, or null where it isn't set up. */
export const liveKitOf = (env: Bindings): LiveKitConfig | null =>
  env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET
    ? { url: env.LIVEKIT_URL, key: env.LIVEKIT_API_KEY, secret: env.LIVEKIT_API_SECRET }
    : null;

/** A room token lasts long enough to sit a whole evening; LiveKit keeps a joined room open past it. */
export const ROOM_TOKEN_TTL_S = 6 * 60 * 60;

export type FireMode = FireAttributes['mode'];

/**
 * What a person may do in the room: everyone hears and may update their own attributes (their
 * lantern, their captions); only someone who joined in may publish their mic, lantern and screen.
 * Listening never opens the mic, so a listener's token can't publish at all.
 */
export const grantsFor = (room: FireRoom, mode: FireMode) => ({
  room,
  roomJoin: true,
  canSubscribe: true,
  canPublishData: true,
  canUpdateOwnMetadata: true,
  canPublish: mode === 'join',
  canPublishSources: mode === 'join' ? ['microphone', 'camera', 'screen_share'] : [],
});

/** A token for `person` to sit in `room`, with their attributes set by the API. */
export async function roomToken(
  lk: LiveKitConfig,
  person: PersonId,
  room: FireRoom,
  attributes: FireAttributes,
  nowSeconds: number,
): Promise<string> {
  return signJwt(
    {
      iss: lk.key,
      sub: person,
      nbf: nowSeconds,
      exp: nowSeconds + ROOM_TOKEN_TTL_S,
      video: grantsFor(room, attributes.mode),
      attributes: stringAttributes(attributes),
    },
    lk.secret,
  );
}

/** Attributes as LiveKit holds them: strings only, absent keys left out. */
export const stringAttributes = (a: FireAttributes): Record<string, string> => ({
  mode: a.mode,
  captionsOk: a.captionsOk,
  lantern: a.lantern,
  ...(a.captionsIn === undefined ? {} : { captionsIn: a.captionsIn }),
});

/** A participant as the room service lists one. */
export type RoomParticipant = { identity: string; attributes: Record<string, string> };

const SERVICE = 'livekit.RoomService';
/** Room-service calls give up after this long: a slow LiveKit never holds a phone's request. */
const CALL_TIMEOUT_MS = 4000;

const httpBase = (url: string): string =>
  url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');

/** One Twirp call to the room service, as an admin of `room`. Throws on any failure. */
async function call(
  lk: LiveKitConfig,
  method: string,
  room: FireRoom,
  body: object,
  nowSeconds: number,
): Promise<unknown> {
  const token = await signJwt(
    { iss: lk.key, nbf: nowSeconds, exp: nowSeconds + 60, video: { room, roomAdmin: true } },
    lk.secret,
  );
  const response = await fetch(`${httpBase(lk.url)}/twirp/${SERVICE}/${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (!response.ok) {
    // The body of a Twirp error names its code; never the request.
    throw new Error(`livekit ${method} answered ${response.status}`);
  }
  return response.json();
}

/** Who is in the room now, with their attributes. Empty when the room isn't open. */
export async function listParticipants(
  lk: LiveKitConfig,
  room: FireRoom,
  nowSeconds: number,
): Promise<RoomParticipant[]> {
  let answer: unknown;
  try {
    answer = await call(lk, 'ListParticipants', room, { room }, nowSeconds);
  } catch (error) {
    // A room nobody is in doesn't exist: LiveKit answers not_found.
    if (error instanceof Error && error.message.endsWith('404')) return [];
    throw error;
  }
  const list = (answer as { participants?: unknown }).participants;
  if (!Array.isArray(list)) return [];
  return list.flatMap((p: unknown) => {
    if (typeof p !== 'object' || p === null) return [];
    const { identity, attributes } = p as { identity?: unknown; attributes?: unknown };
    if (typeof identity !== 'string') return [];
    const attrs: Record<string, string> = {};
    if (typeof attributes === 'object' && attributes !== null) {
      for (const [k, v] of Object.entries(attributes)) if (typeof v === 'string') attrs[k] = v;
    }
    return [{ identity, attributes: attrs }];
  });
}

/**
 * A listener who joins in: the room lets them publish from now on, and their `mode` reads `join`.
 * Answers false when they aren't in the room (their next connection uses the new token anyway).
 */
export async function letJoinIn(
  lk: LiveKitConfig,
  room: FireRoom,
  person: PersonId,
  nowSeconds: number,
): Promise<boolean> {
  const g = grantsFor(room, 'join');
  try {
    await call(
      lk,
      'UpdateParticipant',
      room,
      {
        room,
        identity: person,
        permission: {
          canSubscribe: g.canSubscribe,
          canPublish: g.canPublish,
          canPublishData: g.canPublishData,
          canUpdateMetadata: g.canUpdateOwnMetadata,
          canPublishSources: ['MICROPHONE', 'CAMERA', 'SCREEN_SHARE'],
        },
        attributes: { mode: 'join' },
      },
      nowSeconds,
    );
    return true;
  } catch {
    return false;
  }
}

/** Sends `data` on `topic` to the listed people in the room, reliably. */
export async function sendData(
  lk: LiveKitConfig,
  room: FireRoom,
  topic: string,
  data: Uint8Array,
  to: readonly string[],
  nowSeconds: number,
): Promise<void> {
  if (to.length === 0) return;
  await call(
    lk,
    'SendData',
    room,
    { room, data: toBase64(data), kind: 'RELIABLE', destinationIdentities: to, topic },
    nowSeconds,
  );
}
