import { farmOfFireRoom, type FarmId, LiveKitWebhook } from '@kithfield/contracts';

import { sha256Base64, verifyJwt } from './jwt';
import type { LiveKitConfig } from './livekit';
import type { RoomEvent } from './circle';

/*
 * LiveKit's webhook: `POST /v1/webhooks/livekit` with the event as JSON and an `Authorization`
 * header holding a JWT signed with the API secret, issued by the API key, whose `sha256` claim is
 * the body's hash. Nothing is acted on before that checks out.
 */

/** A verified event for a farm's fire, or null for one that isn't (another room, no room). */
export type FireRoomEvent = {
  readonly farm: FarmId;
  readonly event: RoomEvent;
  readonly id: string;
};

/** The body, if the header is LiveKit's signature over exactly it. */
export async function verifiedBody(
  lk: LiveKitConfig,
  authorization: string | undefined,
  body: Uint8Array<ArrayBuffer>,
  nowSeconds: number,
): Promise<unknown> {
  if (authorization === undefined) return undefined;
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const claims = await verifyJwt(token, lk.secret, nowSeconds);
  if (claims === null || claims['iss'] !== lk.key) return undefined;
  if (claims['sha256'] !== (await sha256Base64(body))) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return undefined;
  }
}

/** What the fire makes of a verified body: null for anything that isn't about a farm's fire. */
export function fireRoomEvent(raw: unknown): FireRoomEvent | null {
  const parsed = LiveKitWebhook.safeParse(raw);
  if (!parsed.success) return null;
  const hook = parsed.data;
  const farm = hook.room ? farmOfFireRoom(hook.room.name) : null;
  if (farm === null || hook.room === undefined) return null;
  return {
    farm,
    id: hook.id,
    event: {
      event: hook.event,
      at: Number(hook.createdAt),
      room: hook.room.sid,
      identity: hook.participant?.identity ?? null,
    },
  };
}
