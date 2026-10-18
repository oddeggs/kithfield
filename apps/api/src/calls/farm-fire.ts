import type { PersonId } from '@kithfield/contracts';

import { fireOutAfterMs } from '../farm/farm';
import type { FarmHost } from '../farm/host';
import { send, who } from '../farm/sockets';
import { applyRoomEvent, circleFrom, circlePeople, type Circle, type RoomEvent } from './circle';

/*
 * The fire room inside a farm object: who is by the fire (from LiveKit's webhook, kept in the
 * object's own storage, never in the log), told to phones in the `presence` frame, and the fire
 * going out 3 minutes after the last person leaves. No push and no event: sitting down is the
 * phone's own `fire {sat}`.
 */

const KEY = 'fire-circle';

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

/** Whether anyone is in the room, as far as the webhook has said. */
export const fireOccupied = (host: FarmHost): boolean =>
  Object.keys(circleOf(host).people).length > 0;

/** The `presence` frame: who has the farm open, and who is by the fire. */
export const presenceFrame = (host: FarmHost, here: PersonId[]) =>
  ({ type: 'presence', here, fire: fireOf(host) }) as const;

/**
 * One event from the room: the circle changes, phones hear who is by the fire when that changed,
 * and the fire's going-out timer follows whether anyone is left.
 */
export async function onRoomEvent(host: FarmHost, event: RoomEvent): Promise<void> {
  // A room named for a farm that doesn't exist (or no longer does) has nothing to tell.
  if (host.farm.state === null) return;
  const before = fireOf(host);
  const wasOccupied = fireOccupied(host);
  host.ctx.storage.kv.put(KEY, applyRoomEvent(circleOf(host), event));
  const occupied = fireOccupied(host);
  const after = fireOf(host);
  if (after.join() !== before.join()) {
    const sockets = host.sockets();
    const frame = presenceFrame(host, who(sockets, 'here'));
    for (const ws of sockets) send(ws, frame);
  }
  if (occupied) host.store.deleteTimer('fire_out');
  else if (wasOccupied && host.farm.state?.fireLitAt != null)
    host.store.setTimer('fire_out', host.now() + fireOutAfterMs);
  await host.schedule();
}
