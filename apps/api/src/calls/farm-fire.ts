import { fireRoomOf, type PersonId } from '@kithfield/contracts';

import { fireOutAfterMs } from '../farm/farm';
import type { FarmHost } from '../farm/host';
import { send, who } from '../farm/sockets';
import {
  applyRoomEvent,
  circleFrom,
  circlePeople,
  rebuildCircle,
  type Circle,
  type RoomEvent,
} from './circle';
import { listParticipants, liveKitOf, removeParticipant } from './livekit';

/*
 * The fire room inside a farm object: who is by the fire (from LiveKit's webhook, kept in the
 * object's own storage, never in the log), told to phones in the `presence` frame, and the fire
 * going out 3 minutes after the last person leaves. While anyone sits, the farm looks at the room
 * itself every few minutes, so a missed webhook never keeps a fire lit, nor puts one out. No push
 * and no event: sitting down is the phone's own `fire {sat}`.
 */

const KEY = 'fire-circle';
const HOOKS = 'fire-hooks';

/** How often the farm looks at the room while someone sits by the fire. */
export const FIRE_RECHECK_MS = 3 * 60_000;
/** How long a webhook delivery's id is remembered, to act on each one once. */
const HOOK_MEMORY_MS = 15 * 60_000;

const circleOf = (host: FarmHost): Circle => circleFrom(host.ctx.storage.kv.get(KEY));

/** Who is by the fire now: members only, by the id the farm knows them by, in the order they sat. */
export function fireOf(host: FarmHost): PersonId[] {
  const state = host.farm.state;
  if (state === null || state.fireLitAt === null) return [];
  const members = new Set(state.members.map((m) => m.person));
  const out: PersonId[] = [];
  for (const identity of circlePeople(circleOf(host))) {
    const person = host.farm.actorOf(identity);
    if (members.has(person) && !out.includes(person)) out.push(person);
  }
  return out;
}

/** Whether anyone is in the room, as far as the farm knows. */
export const fireOccupied = (host: FarmHost): boolean =>
  Object.keys(circleOf(host).people).length > 0;

/** The `presence` frame: who has the farm open, and who is by the fire. */
export const presenceFrame = (host: FarmHost, here: PersonId[]) =>
  ({ type: 'presence', here, fire: fireOf(host) }) as const;

/** Tells every phone who is here and who is by the fire. */
export function tellPresence(host: FarmHost): void {
  const sockets = host.sockets();
  const frame = presenceFrame(host, who(sockets, 'here'));
  for (const ws of sockets) send(ws, frame);
}

/** Stores a new circle; phones hear when who is by the fire changed; the timer follows. */
async function setCircle(host: FarmHost, next: Circle): Promise<void> {
  const before = fireOf(host);
  const wasOccupied = fireOccupied(host);
  host.ctx.storage.kv.put(KEY, next);
  if (fireOf(host).join() !== before.join()) tellPresence(host);
  const occupied = fireOccupied(host);
  if (host.farm.state?.fireLitAt != null) {
    if (occupied) host.store.setTimer('fire_out', host.now() + FIRE_RECHECK_MS);
    else if (wasOccupied) host.store.setTimer('fire_out', host.now() + fireOutAfterMs);
  }
  await host.schedule();
}

/** Whether this delivery was seen already; remembers it either way. */
function seenBefore(host: FarmHost, id: string | undefined): boolean {
  if (id === undefined || id === '') return false;
  const now = host.now();
  const stored = host.ctx.storage.kv.get(HOOKS);
  const known = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
    string,
    number
  >;
  if (known[id] !== undefined) return true;
  const kept = Object.fromEntries(
    Object.entries(known).filter(([, at]) => at > now - HOOK_MEMORY_MS),
  );
  host.ctx.storage.kv.put(HOOKS, { ...kept, [id]: now });
  return false;
}

/** One event from the room's webhook, acted on once. */
export async function onRoomEvent(host: FarmHost, event: RoomEvent): Promise<void> {
  // A room named for a farm that doesn't exist (or no longer does) has nothing to tell.
  if (host.farm.state === null) return;
  if (seenBefore(host, event.id)) return;
  await setCircle(host, applyRoomEvent(circleOf(host), event));
}

/**
 * The fire's timer, due: the farm asks the room who is really there. Answers whether the fire may
 * go out now; when someone is still there it looks again in a few minutes. Throws when the room
 * can't be asked, so the alarm tries again shortly.
 */
export async function fireMayGoOut(host: FarmHost): Promise<boolean> {
  const state = host.farm.state;
  const lk = liveKitOf(host.env);
  if (state === null) return false;
  if (lk !== null) {
    const listed = await listParticipants(
      lk,
      fireRoomOf(state.farm),
      Math.floor(host.now() / 1000),
    );
    const rebuilt = rebuildCircle(
      circleOf(host),
      listed.map((p) => ({ identity: p.identity, sid: p.sid, at: p.joinedAt })),
    );
    const before = fireOf(host);
    host.ctx.storage.kv.put(KEY, rebuilt);
    if (fireOf(host).join() !== before.join()) tellPresence(host);
  }
  if (!fireOccupied(host)) return true;
  host.store.setTimer('fire_out', host.now() + FIRE_RECHECK_MS);
  return false;
}

/**
 * Someone left the farm, was removed or banned, or deleted their account: they are taken out of
 * the room at once, and off the circle.
 */
export function evictFromFire(host: FarmHost, person: PersonId): void {
  const state = host.farm.state;
  const lk = liveKitOf(host.env);
  if (state === null) return;
  const circle = circleOf(host);
  const ids = [...new Set([person, ...host.store.idsOf(host.farm.actorOf(person))])];
  const room = fireRoomOf(state.farm);
  const now = Math.floor(host.now() / 1000);
  const people = Object.fromEntries(
    Object.entries(circle.people).filter(([id]) => !ids.includes(id)),
  );
  if (Object.keys(people).length !== Object.keys(circle.people).length) {
    host.ctx.storage.kv.put(KEY, { ...circle, people });
    tellPresence(host);
  }
  if (lk === null) return;
  host.ctx.waitUntil(
    Promise.all(
      ids.map((id) =>
        removeParticipant(lk, room, id, now).catch((error: unknown) => {
          console.error('fire room removal failed', {
            error: error instanceof Error ? error.message : 'unknown',
          });
        }),
      ),
    ),
  );
}
