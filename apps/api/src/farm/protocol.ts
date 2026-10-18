import {
  type FarmCommand,
  FarmClientFrame,
  LIMITS,
  OpId,
  PROTOCOL_VERSION,
} from '@kithfield/contracts';

import { rtTokenSession } from '../auth';
import { socketPerson } from './adapters/identity';
import type { FarmHost } from './host';
import { attach, attachmentOf, refuse, send, who } from './sockets';

/*
 * The farm socket: hello and catch-up, commands with their acks, presence and typing. Frames are
 * JSON; `ping` is answered by the hibernation auto-response and never reaches here.
 */

type Hello = Extract<FarmClientFrame, { type: 'hello' }>;

/** Sends the snapshot when the phone holds nothing or is too far behind, then the events after. */
const catchUp = (host: FarmHost, ws: WebSocket, lastSeq: number): void => {
  const state = host.farm.state;
  const head = host.farm.head;
  if (state === null) return;
  let from = lastSeq;
  // Below the resync point the farm's state changed outside the log (a person merge).
  const stale = lastSeq < host.store.resyncBelow();
  if (lastSeq === 0 || stale || lastSeq > head || head - lastSeq > LIMITS.snapshotGap) {
    send(ws, { type: 'snapshot', seq: head, state });
    from = head;
  }
  for (;;) {
    const events = host.store.after(from, LIMITS.eventsBatch);
    const last = events.at(-1)?.seq ?? from;
    const more = last < head;
    send(ws, { type: 'events', events, more });
    if (!more) return;
    from = last;
  }
};

const hello = async (host: FarmHost, ws: WebSocket, frame: Hello): Promise<void> => {
  if (frame.protocol !== PROTOCOL_VERSION) return refuse(ws, 'protocol_unsupported');
  // The token comes first, so nobody learns whether a farm exists without one for it.
  const { farm } = attachmentOf(ws);
  const person = await socketPerson(host.env, frame.token, farm);
  if (person === null) return refuse(ws, 'unauthorized');
  // Nothing awaits from here on, so no event can slip between the checks, the catch-up and live
  // delivery. Membership is the farm's own: D1 only mirrors it.
  const state = host.farm.state;
  if (state === null || state.farm !== farm) return refuse(ws, 'farm_gone');
  const actor = host.farm.actorOf(person);
  if (!state.members.some((m) => m.person === actor)) return refuse(ws, 'not_member');
  if (frame.rulesVersion < state.rulesVersion) return refuse(ws, 'rules_outdated');
  attach(ws, { ...attachmentOf(ws), person, session: rtTokenSession(frame.token) });
  catchUp(host, ws, frame.lastSeq);
  const sockets = host.sockets();
  send(ws, { type: 'presence', here: who(sockets, 'here') });
  send(ws, { type: 'typing', people: who(sockets, 'typing') });
};

const command = async (host: FarmHost, ws: WebSocket, cmd: FarmCommand): Promise<void> => {
  const person = attachmentOf(ws).person;
  if (person === null) return refuse(ws, 'unauthorized');
  const media: string[] = [];
  const written = await host.command(cmd, person, media);
  if (written.event !== null) host.publish([written.event]);
  const r = written.result;
  send(
    ws,
    r.result === 'ack'
      ? { type: 'ack', opId: r.opId, seq: r.seq }
      : { type: 'rejected', opId: r.opId, reason: r.reason },
  );
  if (written.event !== null) await host.settle([written.event], media);
};

/** Broadcasts presence or typing when the set of people changed. */
export const refreshPresence = (
  host: FarmHost,
  before: { here: string[]; typing: string[] },
  closing?: WebSocket,
): void => {
  const sockets = host.sockets(closing);
  const here = who(sockets, 'here');
  const typing = who(sockets, 'typing');
  if (here.join() !== before.here.join())
    for (const ws of sockets) send(ws, { type: 'presence', here });
  if (typing.join() !== before.typing.join())
    for (const ws of sockets) send(ws, { type: 'typing', people: typing });
};

const snapshotOf = (host: FarmHost) => {
  const sockets = host.sockets();
  return { here: who(sockets, 'here'), typing: who(sockets, 'typing') };
};

const parseJson = (message: string): unknown => {
  try {
    return JSON.parse(message) as unknown;
  } catch {
    return undefined;
  }
};

/** One message from a phone. Unknown frame types and anything that isn't JSON are ignored. */
export const onMessage = async (
  host: FarmHost,
  ws: WebSocket,
  message: string | ArrayBuffer,
): Promise<void> => {
  if (typeof message !== 'string') return;
  const raw = parseJson(message);
  const parsed = FarmClientFrame.safeParse(raw);
  const said = attachmentOf(ws);
  if (!parsed.success) {
    const fields =
      typeof raw === 'object' && raw !== null ? (raw as { type?: unknown; opId?: unknown }) : {};
    if (fields.type === 'hello') return refuse(ws, 'unauthorized');
    const opId = OpId.safeParse(fields.opId);
    const type = fields.type;
    if (type !== 'cmd' || !opId.success) return;
    if (said.person === null) return refuse(ws, 'unauthorized');
    // A write that doesn't parse is still answered, so the phone's outbox never blocks on it.
    const r = host.farm.rejectInvalid(opId.data).result;
    send(
      ws,
      r.result === 'ack'
        ? { type: 'ack', opId: r.opId, seq: r.seq }
        : { type: 'rejected', opId: r.opId, reason: r.reason },
    );
    return;
  }
  const frame = parsed.data;
  if (frame.type === 'unknown') return;
  if (frame.type === 'hello') return hello(host, ws, frame);
  if (said.person === null) return refuse(ws, 'unauthorized');
  if (frame.type === 'cmd') {
    const { type: _type, ...cmd } = frame;
    return command(host, ws, cmd);
  }
  const before = snapshotOf(host);
  if (frame.type === 'presence') {
    attach(ws, { ...said, here: frame.here });
    refreshPresence(host, before);
    if (frame.here && !said.here) await host.opened(said.person);
    return;
  }
  attach(ws, { ...said, typing: frame.on });
  refreshPresence(host, before);
};
