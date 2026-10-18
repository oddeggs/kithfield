import { vi } from 'vitest';

/** A participant as the stand-in room service lists them. */
export type ListedParticipant = {
  identity: string;
  sid?: string;
  joinedAt?: string;
  attributes: Record<string, string>;
};

/**
 * LiveKit's room service, stood in for in the Workers runtime: it answers as the real one does
 * (an unknown participant is `not_found`) and records each call, by method, with its JSON.
 */
export function standInLiveKit() {
  const room = {
    asked: [] as { method: string; body: Record<string, unknown> }[],
    inRoom: [] as ListedParticipant[],
  };
  const real = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://kithfield-cvm2v8ac.livekit.cloud/twirp/'))
      return real(input, init);
    const method = url.split('/').pop() ?? '';
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
      string,
      unknown
    >;
    room.asked.push({ method, body });
    if (method === 'ListParticipants') return Response.json({ participants: room.inRoom });
    const known = room.inRoom.some((p) => p.identity === body['identity']);
    if ((method === 'UpdateParticipant' || method === 'RemoveParticipant') && !known)
      return Response.json({ code: 'not_found' }, { status: 404 });
    return Response.json({});
  });
  return room;
}

/** Waits for the stand-in to be asked something (work the farm object does after answering). */
export async function askedFor(
  room: ReturnType<typeof standInLiveKit>,
  method: string,
  timeoutMs = 2000,
): Promise<Record<string, unknown>[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const found = room.asked.filter((a) => a.method === method).map((a) => a.body);
    if (found.length > 0 || Date.now() > until) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** A LiveKit webhook delivery, signed as LiveKit signs them (`exp: false` leaves expiry out). */
export async function deliverHook(
  body: object,
  options: { secret?: string; exp?: boolean } = {},
): Promise<Response> {
  const { env, exports } = await import('cloudflare:workers');
  const { sha256Base64, signJwt } = await import('./jwt');
  const raw = new TextEncoder().encode(JSON.stringify(body));
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    {
      iss: env.LIVEKIT_API_KEY,
      nbf: now,
      ...(options.exp === false ? {} : { exp: now + 300 }),
      sha256: await sha256Base64(raw),
    },
    options.secret ?? env.LIVEKIT_API_SECRET ?? '',
  );
  return exports.default.fetch('https://dev.kithfield.com/api/v1/webhooks/livekit', {
    method: 'POST',
    headers: { authorization: token, 'content-type': 'application/webhook+json' },
    body: raw,
  });
}

/** A participant event for a farm's fire room. */
export const participantEvent = (
  event: string,
  room: string,
  identity: string,
  at: number,
  sid = `PA_${identity}`,
  id = `EV_${event}_${identity}_${at}_${sid}`,
) => ({
  event,
  id,
  createdAt: String(at),
  room: { name: room, sid: 'RM_one' },
  participant: { identity, sid },
});
