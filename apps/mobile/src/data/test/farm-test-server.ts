import {
  CottageClientFrame,
  FarmClientFrame,
  FarmEvent,
  LIMITS,
  PING,
  PONG,
  PROTOCOL_VERSION,
  type ChatListItem,
  type CommandResult,
  type FarmCommand,
  type FarmServerFrame,
  type SocketErrorCode,
} from '@kithfield/contracts';

import type { FarmRules } from '../farm-rules';
import type { OpenSocket } from '../socket';
import { connectPair, type ServerEnd } from './test-sockets';
import {
  TEST_CRITTER,
  farmDay,
  farmOpId,
  seedFarm,
  writtenPayload,
  type Session,
  type TestFarm,
} from './test-server-seed';

export type { TestFarm } from './test-server-seed';
import { handleHttp } from './test-server-http';

/*
 * A protocol-faithful stand-in for the API and the farm and cottage objects, for the sync tests
 * only: it speaks the contracts' frames exactly (hello, snapshot, catch-up batches of 200, live
 * events, ack after the broadcast, rejections, idempotent op ids, socket errors, ping and pong)
 * and the HTTP command, paging and rt-token endpoints. It runs in process; the network between it
 * and the phone is `test-sockets`. Each test controls reachability and can write events a real
 * farm would refuse to, to see how the phone sorts them.
 */

export class FarmTestServer {
  readonly farms = new Map<string, TestFarm>();
  readonly people = new Set<string>();
  /** Socket tokens: token → who and for which farm (null for the cottage). */
  readonly tokens = new Map<string, { person: string; farm: string | null; expiresAt: number }>();
  readonly chats = new Map<string, ChatListItem[]>();
  /** False: no network at all. */
  online = true;
  /** False: sockets fail to connect while HTTP still answers. */
  acceptSockets = true;
  answerPings = true;
  /** True: the farm applies each socket write, then the connection drops before any answer. */
  loseAnswers = false;
  readonly sessions = new Set<Session>();
  /** Every frame each farm socket was sent, for checking order. */
  readonly sentFrames: { farm: string | null; frame: Record<string, unknown> }[] = [];
  hellos: Record<string, unknown>[] = [];
  readonly httpCommands: string[] = [];
  private tokenCounter = 0;

  constructor(
    readonly rules: FarmRules<unknown>,
    readonly now: () => number = Date.now,
  ) {}

  /* Setting up */

  createFarm(farm: string, keeper: string, name: string): TestFarm {
    const record = seedFarm(this.rules, farm, name, this.now());
    this.farms.set(farm, record);
    this.join(farm, keeper);
    return record;
  }

  join(farm: string, person: string): void {
    this.people.add(person);
    this.farmOf(farm).members.add(person);
    const joined = { name: person.replace('p_', ''), critter: TEST_CRITTER, via: 'invite' };
    this.write(farm, person, 'joined', joined);
  }

  /** Writes an event as the farm would, strictly checked, and broadcasts it. */
  write(farm: string, actor: string | null, kind: string, payload: unknown, opId = farmOpId()) {
    const f = this.farmOf(farm);
    const event = FarmEvent.parse({
      seq: f.log.length + 1,
      opId,
      at: this.now(),
      day: farmDay(this.now()),
      rulesVersion: f.rulesVersion,
      actor,
      kind,
      payload,
    });
    f.log.push(event);
    f.state = this.rules.applyEvent(f.state, event);
    this.broadcast(farm, { type: 'event', event });
    return event;
  }

  /** Appends an envelope no real farm would write (an unknown kind, a broken payload). */
  writeRaw(farm: string, fields: { kind: string; actor: string | null; payload: unknown }) {
    const f = this.farmOf(farm);
    const event = {
      seq: f.log.length + 1,
      opId: farmOpId(),
      at: this.now(),
      day: farmDay(this.now()),
      rulesVersion: f.rulesVersion,
      ...fields,
    };
    f.log.push(event);
    this.broadcast(farm, { type: 'event', event });
  }

  farmOf(farm: string): TestFarm {
    const f = this.farms.get(farm);
    if (!f) throw new Error(`No farm ${farm}`);
    return f;
  }

  issueToken(person: string, farm: string | null): { token: string; expiresAt: number } {
    this.tokenCounter += 1;
    const token = `rt_${person}_${this.tokenCounter}_${'x'.repeat(16)}`;
    const expiresAt = this.now() + LIMITS.rtTokenMs;
    this.tokens.set(token, { person, farm, expiresAt });
    return { token, expiresAt };
  }

  /** Every open socket drops, as when the network goes away. */
  dropAll(): void {
    for (const s of [...this.sessions]) {
      this.sessions.delete(s);
      s.end.close();
    }
  }

  /* Commands: one path for the socket and HTTP, applied once per op id */

  command(farm: string, person: string, cmd: FarmCommand): CommandResult {
    const f = this.farmOf(farm);
    const earlier = f.outcomes.get(cmd.opId);
    if (earlier) {
      return 'seq' in earlier
        ? { result: 'ack', opId: cmd.opId, seq: earlier.seq }
        : { result: 'rejected', opId: cmd.opId, reason: earlier.reason as never };
    }
    const reason = f.members.has(person)
      ? this.rules.checkCommand(f.state, cmd, person, this.now())
      : 'not_member';
    if (reason !== null) {
      f.outcomes.set(cmd.opId, { reason });
      return { result: 'rejected', opId: cmd.opId, reason };
    }
    const event = this.write(farm, person, cmd.kind, writtenPayload(cmd, this.now()), cmd.opId);
    f.outcomes.set(cmd.opId, { seq: event.seq });
    return { result: 'ack', opId: cmd.opId, seq: event.seq };
  }

  /* Sockets */

  readonly openSocket: OpenSocket = (url) => {
    const { phone } = connectPair(
      url,
      {
        onMessage: (end, text) => this.receive(end, text),
        onClose: (end) => {
          for (const s of this.sessions) if (s.end === end) this.sessions.delete(s);
        },
      },
      this.online && this.acceptSockets,
    );
    return phone;
  };

  private sessionOf(end: ServerEnd): Session {
    for (const s of this.sessions) if (s.end === end) return s;
    const farm = /\/v1\/farms\/([^/]+)\/socket$/.exec(end.url)?.[1] ?? null;
    const cottage = /\/v1\/cottage\/([^/]+)\/socket$/.exec(end.url)?.[1];
    if (!farm && !cottage) throw new Error(`No socket at ${end.url}`);
    const session: Session = {
      end,
      person: null,
      farm: farm ? decodeURIComponent(farm) : null,
      ...(cottage ? { cottage: decodeURIComponent(cottage) } : {}),
    };
    this.sessions.add(session);
    return session;
  }

  private send(session: Session, frame: Record<string, unknown>) {
    if (session.silenced) return;
    this.sentFrames.push({ farm: session.farm, frame });
    session.end.send(JSON.stringify(frame));
  }

  private fail(session: Session, code: SocketErrorCode) {
    this.send(session, { type: 'error', code });
    this.sessions.delete(session);
    session.end.close();
  }

  private broadcast(farm: string, frame: Record<string, unknown>) {
    for (const s of this.sessions) if (s.farm === farm && s.person) this.send(s, frame);
  }

  private receive(end: ServerEnd, text: string): void {
    if (text === PING) {
      if (this.answerPings) end.send(PONG);
      return;
    }
    const session = this.sessionOf(end);
    const data: unknown = JSON.parse(text);
    if (session.farm === null) return this.receiveCottage(session, data);
    const frame = FarmClientFrame.parse(data);
    if (frame.type === 'hello') return this.hello(session, frame);
    if (!session.person) return this.fail(session, 'unauthorized');
    if (frame.type === 'cmd') {
      const { type: _type, ...cmd } = frame;
      session.silenced = this.loseAnswers;
      const result = this.command(session.farm, session.person, cmd);
      if (session.silenced) {
        this.sessions.delete(session);
        session.end.close();
        return;
      }
      if (result.result === 'ack')
        this.send(session, { type: 'ack', opId: result.opId, seq: result.seq });
      else this.send(session, { type: 'rejected', opId: result.opId, reason: result.reason });
    } else if (frame.type === 'presence') {
      session.here = frame.here;
      const here = [...this.sessions]
        .filter((s) => s.farm === session.farm && s.here && s.person)
        .map((s) => s.person);
      this.broadcast(session.farm, { type: 'presence', here: [...new Set(here)] });
    } else if (frame.type === 'typing') {
      this.broadcast(session.farm, { type: 'typing', people: frame.on ? [session.person] : [] });
    }
  }

  private hello(session: Session, hello: FarmClientFrame & { type: 'hello' }) {
    this.hellos.push({ ...hello, farm: session.farm });
    const farm = this.farmOf(session.farm ?? '');
    const token = this.tokens.get(hello.token);
    if (hello.protocol !== PROTOCOL_VERSION) return this.fail(session, 'protocol_unsupported');
    if (!token || token.farm !== farm.farm || token.expiresAt < this.now()) {
      return this.fail(session, 'unauthorized');
    }
    if (!farm.members.has(token.person)) return this.fail(session, 'not_member');
    if (hello.rulesVersion < farm.rulesVersion) return this.fail(session, 'rules_outdated');
    session.person = token.person;

    const head = farm.log.length;
    let after = hello.lastSeq;
    if (after === 0 || head - after > LIMITS.snapshotGap) {
      this.send(session, { type: 'snapshot', seq: head, state: farm.state });
      after = head;
    }
    const rest = farm.log.slice(after);
    if (rest.length === 0) this.send(session, { type: 'events', events: [], more: false });
    for (let i = 0; i < rest.length; i += LIMITS.eventsBatch) {
      const events = rest.slice(i, i + LIMITS.eventsBatch);
      this.send(session, { type: 'events', events, more: i + LIMITS.eventsBatch < rest.length });
    }
  }

  private receiveCottage(session: Session, data: unknown) {
    const frame = CottageClientFrame.parse(data);
    if (frame.type !== 'hello') return;
    const token = this.tokens.get(frame.token);
    // The cottage checks the token is the person its URL names.
    if (!token || token.farm !== null || token.person !== session.cottage) {
      return this.fail(session, 'unauthorized');
    }
    session.person = token.person;
    this.send(session, { type: 'chats', chats: this.chats.get(token.person) ?? [] });
  }

  /** A changed chat row, or a note from the safety team, reaches the person's cottage socket. */
  pushChat(person: string, chat: ChatListItem): void {
    const others = (this.chats.get(person) ?? []).filter((c) => c.farm !== chat.farm);
    this.chats.set(person, [...others, chat]);
    this.toCottage(person, { type: 'chat', chat });
  }

  safetyNote = (person: string) => this.toCottage(person, { type: 'safety_note' });

  private toCottage(person: string, frame: Record<string, unknown>) {
    for (const s of this.sessions) if (s.cottage === person && s.person) this.send(s, frame);
  }

  /** The API over HTTP, as `fetch`. The bearer is the person's id. */
  readonly fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    handleHttp(this, input, init);

  /** The frames sent to one farm's sockets, of one type. */
  framesOf(type: FarmServerFrame['type']): Record<string, unknown>[] {
    return this.sentFrames.filter((f) => f.frame['type'] === type).map((f) => f.frame);
  }
}
