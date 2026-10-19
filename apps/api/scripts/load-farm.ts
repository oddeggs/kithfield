/**
 * Load test for one farm object: N phones on one farm, through the real routes and sockets.
 *
 *   pnpm --filter @kithfield/api load:farm -- --api http://localhost:8787 --phones 24
 *
 * Each phone signs in anonymously (its own client address), passes the age check and picks a
 * critter; the first plants the farm and the rest join by its invite. A farm holds 24 members, so
 * more phones than that are second devices of the same members. Every phone then opens the
 * farm's socket, says hello, catches up and turns presence on, and all of them at once send a
 * burst of writes (messages, dewdrops, waves) with typing on and off between them. It reports:
 * - command latency (send → ack, p50/p95/max) and rejections or errors;
 * - fan-out latency (send → the event arriving on every other phone, p50/p95/max) and any phone
 *   that missed an event;
 * - the local runtime's resident memory, before and after, when `--pid` names it (`wrangler dev`
 *   runs every object in one `workerd` process locally, so this is an upper bound for the object).
 *
 * Only for a local `wrangler dev`: it makes throwaway people. Never point it at a deployment.
 */
import { execFileSync } from 'node:child_process';

import { opId } from './review-seed';

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return (at === -1 ? undefined : process.argv[at + 1]) ?? fallback;
};

const API = arg('api', 'http://localhost:8787').replace(/\/+$/, '');
const PHONES = Number(arg('phones', '6'));
const BURST = Number(arg('burst', '10'));
const PID = arg('pid', '');
/** `--typing off` leaves out the typing frames around each write. */
const TYPING = arg('typing', 'on') !== 'off';
const MEMBER_LIMIT = 24;
const PROTOCOL = 1;
const RULES = 4;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  console.error('Only a local wrangler dev: --api http://localhost:<port>');
  process.exit(2);
}

let addresses = 0;
const freshIp = () => {
  addresses += 1;
  return `10.77.${Math.floor(addresses / 250)}.${addresses % 250}`;
};

async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  ip = freshIp(),
): Promise<unknown> {
  const headers: Record<string, string> = { 'cf-connecting-ip': ip };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API}/api${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}`);
  return text === '' ? null : (JSON.parse(text) as unknown);
}

interface Member {
  readonly id: string;
  readonly token: string;
}

const SPECIES = ['mouse', 'rabbit', 'fox', 'duck', 'bear', 'otter', 'frog', 'cat'];

async function newMember(i: number): Promise<Member> {
  const ip = freshIp();
  const { token, user } = (await call('POST', '/auth/sign-in/anonymous', {}, undefined, ip)) as {
    token: string;
    user: { id: string };
  };
  await call('POST', '/v1/me/age', { birthYear: 1990, country: 'GB' }, token, ip);
  const critter = {
    species: SPECIES[i % SPECIES.length],
    coat: 'amber',
    mark: null,
    accessory: null,
    outfit: null,
    outfitColor: null,
    companion: null,
    cottage: null,
  };
  await call('PATCH', '/v1/me/profile', { name: `Load ${i}`, critter }, token, ip);
  return { id: user.id, token };
}

interface Frame {
  readonly type: string;
  readonly opId?: string;
  readonly seq?: number;
  readonly more?: boolean;
  readonly code?: string;
  readonly reason?: string;
  readonly event?: { readonly seq: number; readonly actor: string | null };
}

class Phone {
  readonly ws: WebSocket;
  readonly frames: Frame[] = [];
  readonly eventAt = new Map<number, number>();
  closed = false;
  private waiters: (() => void)[] = [];

  constructor(
    readonly member: Member,
    url: string,
  ) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || !e.data.startsWith('{')) return;
      const frame = JSON.parse(e.data) as Frame;
      this.frames.push(frame);
      if (frame.type === 'event' && frame.event)
        this.eventAt.set(frame.event.seq, performance.now());
      for (const wake of this.waiters.splice(0)) wake();
    });
    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('socket failed')), { once: true });
    });
  }

  async until(test: (f: Frame) => boolean, timeoutMs = 15_000): Promise<Frame> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const found = this.frames.find(test);
      if (found) return found;
      if (this.closed) throw new Error('socket closed');
      if (Date.now() > end) throw new Error('timed out');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 200);
      });
    }
  }

  send(frame: unknown): void {
    this.ws.send(JSON.stringify(frame));
  }
}

const pct = (values: readonly number[], p: number): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
};
const ms = (n: number) => `${n.toFixed(1)} ms`;

const rssMb = (): number | null => {
  if (PID === '') return null;
  try {
    const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', PID]).toString().trim());
    return Math.round(kb / 1024);
  } catch {
    return null;
  }
};

async function main(): Promise<void> {
  const memberCount = Math.min(PHONES, MEMBER_LIMIT);
  const memoryBefore = rssMb();
  const keeper = await newMember(0);
  const planted = (await call(
    'POST',
    '/v1/farms',
    { name: 'Load test', land: 'meadow', timeZone: 'Europe/London', hemisphere: 'north' },
    keeper.token,
  )) as { farm: string; invite: { code: string } };
  const { farm } = planted;
  const members: Member[] = [keeper];
  for (let i = 1; i < memberCount; i += 1) {
    const member = await newMember(i);
    await call(
      'POST',
      `/v1/invites/${planted.invite.code}/join`,
      {
        name: `Load ${i}`,
        critter: {
          species: 'mole',
          coat: 'amber',
          mark: null,
          accessory: null,
          outfit: null,
          outfitColor: null,
          companion: null,
          cottage: null,
        },
      },
      member.token,
    );
    members.push(member);
  }

  // Connect every phone: token, socket, hello, catch up, presence on.
  const socketUrl = `${API.replace(/^http/, 'ws')}/api/v1/farms/${farm}/socket`;
  const connectStart = performance.now();
  const phones = await Promise.all(
    Array.from({ length: PHONES }, async (_, i) => {
      const member = members[i % memberCount] as Member;
      const { token } = (await call('POST', '/v1/rt-token', { farm }, member.token)) as {
        token: string;
      };
      const phone = new Phone(member, socketUrl);
      await phone.opened();
      phone.send({ type: 'hello', protocol: PROTOCOL, token, lastSeq: 0, rulesVersion: RULES });
      await phone.until((f) => (f.type === 'events' && f.more === false) || f.type === 'error');
      const error = phone.frames.find((f) => f.type === 'error');
      if (error) throw new Error(`hello refused: ${error.code ?? 'unknown'}`);
      phone.send({ type: 'presence', here: true });
      return phone;
    }),
  );
  const connectMs = performance.now() - connectStart;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const memoryConnected = rssMb();

  // The burst: every phone sends BURST writes at once, typing around each.
  const sentAt = new Map<string, { at: number; phone: Phone }>();
  const kinds = ['message', 'dewdrop', 'wave'] as const;
  const burstStart = performance.now();
  for (const phone of phones) {
    for (let k = 0; k < BURST; k += 1) {
      const kind = kinds[k % kinds.length] as (typeof kinds)[number];
      const id = opId();
      const payload =
        kind === 'message'
          ? { text: `Hello from ${phone.member.id.slice(0, 6)} #${k}` }
          : kind === 'dewdrop'
            ? {}
            : {};
      if (TYPING) phone.send({ type: 'typing', on: true });
      sentAt.set(id, { at: performance.now(), phone });
      phone.send({ type: 'cmd', opId: id, kind, payload });
      if (TYPING) phone.send({ type: 'typing', on: false });
    }
  }
  const latencies: number[] = [];
  const rejected = new Map<string, number>();
  let errors = 0;
  const seqOf = new Map<string, number>();
  await Promise.all(
    [...sentAt].map(async ([id, { at, phone }]) => {
      try {
        const answer = await phone.until(
          (f) => (f.type === 'ack' || f.type === 'rejected') && f.opId === id,
          30_000,
        );
        if (answer.type === 'ack' && answer.seq !== undefined) {
          latencies.push(performance.now() - at);
          seqOf.set(id, answer.seq);
        } else {
          rejected.set(
            answer.reason ?? 'unknown',
            (rejected.get(answer.reason ?? 'unknown') ?? 0) + 1,
          );
        }
      } catch {
        errors += 1;
      }
    }),
  );
  const burstMs = performance.now() - burstStart;
  // Let the last broadcasts land, then read fan-out from every other phone's receipt times.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const fanOut: number[] = [];
  let missed = 0;
  for (const [id, { at, phone: writer }] of sentAt) {
    const seq = seqOf.get(id);
    if (seq === undefined) continue;
    for (const phone of phones) {
      if (phone === writer) continue;
      const got = phone.eventAt.get(seq);
      if (got === undefined) missed += 1;
      else fanOut.push(got - at);
    }
  }
  const memoryAfter = rssMb();
  for (const phone of phones) phone.ws.close(1000, 'done');

  const writes = sentAt.size;
  console.log(
    JSON.stringify(
      {
        phones: PHONES,
        typing: TYPING,
        members: memberCount,
        writes,
        connectMs: Math.round(connectMs),
        burstMs: Math.round(burstMs),
        writesPerSecond: Math.round((writes / burstMs) * 1000),
        ack: {
          p50: ms(pct(latencies, 50)),
          p95: ms(pct(latencies, 95)),
          max: ms(pct(latencies, 100)),
        },
        fanOut: { p50: ms(pct(fanOut, 50)), p95: ms(pct(fanOut, 95)), max: ms(pct(fanOut, 100)) },
        rejected: Object.fromEntries(rejected),
        errors,
        missedDeliveries: missed,
        workerdRssMb: { before: memoryBefore, connected: memoryConnected, after: memoryAfter },
      },
      null,
      2,
    ),
  );
}

await main();
