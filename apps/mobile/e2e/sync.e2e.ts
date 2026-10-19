import { getRandomValues } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CreateFarmResponse, JoinResponse } from '@kithfield/contracts';
import { farmView } from '@kithfield/farm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOpIdMaker } from '../src/data/op-id';
import { Phone } from './person';
import { startLocalApi, type LocalApi } from './wrangler';

/*
 * End to end against `wrangler dev`: real auth, the farm and cottage objects, local D1. Each step
 * builds on the one before, like two friends using the app over an afternoon.
 */

// Typed here: without Expo's generated types, React Native's `process` global is untyped.
const env = process.env as Partial<Record<string, string>>;
const newOpId = createOpIdMaker((n) => getRandomValues(new Uint8Array(n)));
const PORT = Number(env['E2E_PORT'] ?? 8804);
const TRANSCRIPT = env['E2E_TRANSCRIPT'] ?? join(tmpdir(), `kithfield-e2e-${Date.now()}.log`);

const critter = {
  species: 'rabbit',
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
} as const;

let api: LocalApi;
let bea: Phone;
let pip: Phone;
let farm = '';

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 15_000) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  api.note(`ok: ${what}`);
}

const state = async (phone: Phone) => (await phone.client.replica(farm)).getState();
const live = (phone: Phone) => () => phone.client.link(farm).status === 'live';
const settled = (phone: Phone) => async () => (await state(phone)).pending.length === 0;

beforeAll(async () => {
  mkdirSync(join(TRANSCRIPT, '..'), { recursive: true });
  writeFileSync(TRANSCRIPT, `Kithfield end-to-end run, ${new Date().toISOString()}\n`);
  api = await startLocalApi(PORT, TRANSCRIPT);
  bea = new Phone('bea', api.base);
  pip = new Phone('pip', api.base);
}, 90_000);

afterAll(() => {
  bea?.kill();
  pip?.kill();
  api?.stop();
  console.log(`transcript: ${TRANSCRIPT}`);
});

describe('two friends on a farm', () => {
  it('start as anonymous people, and one plants a farm the other joins', async () => {
    for (const phone of [bea, pip]) {
      const me = await phone.session.ensure();
      expect(me.anonymous).toBe(true);
      // No endpoint sets a name and critter yet: the harness writes them as onboarding would.
      api.sql(
        `UPDATE people SET display_name = '${phone.name}', critter = '${JSON.stringify(critter)}', age_ok = 1 WHERE id = '${me.person}'`,
      );
      await phone.launch();
    }
    const created = await bea.call<CreateFarmResponse>('POST', '/v1/farms', {
      name: 'The Lot',
      land: 'meadow',
      timeZone: 'Europe/London',
      hemisphere: 'north',
    });
    farm = created.farm;
    const joined = await pip.call<JoinResponse>('POST', `/v1/invites/${created.invite.code}/join`, {
      name: 'pip',
      critter,
    });
    expect(joined).toEqual({ farm, status: 'joined' });
    api.note(`farm ${farm}: bea ${bea.person} keeps it, pip ${pip.person} joined`);
  });

  it('chat and dewdrop live, and both farms match the server’s', async () => {
    bea.client.hold(farm);
    pip.client.hold(farm);
    await until('bea live', live(bea));
    await until('pip live', live(pip));

    expect(
      (await bea.client.send(farm, 'message', { text: 'who is coming saturday?' })).status,
    ).toBe('queued');
    await until('bea message acked', settled(bea));
    const [message] = (await bea.client.events(farm, { limit: 1 })).filter(
      (e) => e.kind === 'message',
    );
    if (!message) throw new Error('no message');
    await until('pip has the message', async () => (await state(pip)).lastSeq >= message.seq);

    expect((await pip.client.send(farm, 'dewdrop', { target: message.seq })).status).toBe('queued');
    expect((await pip.client.send(farm, 'message', { text: 'me!' })).status).toBe('queued');
    await until('pip writes acked', settled(pip));
    await until(
      'bea caught up',
      async () => (await state(bea)).lastSeq === (await state(pip)).lastSeq,
    );

    // An empty store for Pip takes the server's snapshot: the farm as the server holds it.
    const server = await snapshotAs(pip, (await state(pip)).lastSeq);
    const now = Date.now();
    for (const phone of [bea, pip]) {
      const confirmed = (await state(phone)).confirmed;
      expect(confirmed && farmView(confirmed, now)).toEqual(farmView(server, now));
    }
  });

  it('writes offline, then catches up and sends its outbox', async () => {
    pip.setOffline(true);
    await until('pip offline', () => pip.client.link(farm).status === 'offline');
    const a = await pip.client.send(farm, 'message', { text: 'on the train' });
    const b = await pip.client.send(farm, 'wave', { to: bea.person });
    await bea.client.send(farm, 'message', { text: 'see you at 4' });
    await until('bea write acked', settled(bea));
    expect((await state(pip)).pending).toHaveLength(2);

    pip.setOffline(false);
    await until('pip outbox drained', settled(pip));
    await until(
      'both at the same seq',
      async () => (await state(bea)).lastSeq === (await state(pip)).lastSeq,
    );
    const beaOps = (await bea.client.events(farm, { limit: 10 })).map((e) => e.opId);
    expect(beaOps).toEqual(
      expect.arrayContaining([a, b].map((s) => (s.status === 'queued' ? s.opId : ''))),
    );
  });

  it('replays its outbox after the app is killed and launched again', async () => {
    pip.setOffline(true);
    const sent = await pip.client.send(farm, 'message', {
      text: 'written before the battery died',
    });
    if (sent.status !== 'queued') throw new Error('expected queued');
    pip.kill();
    await pip.launch();
    expect((await state(pip)).pending.map((p) => p.opId)).toEqual([sent.opId]);
    pip.setOffline(false);
    pip.client.hold(farm);
    await until('replayed write acked', settled(pip));
    await until('bea sees the replayed write', async () =>
      (await bea.client.events(farm, { limit: 5 })).some((e) => e.opId === sent.opId),
    );
  });

  it('sees the chat list update in the cottage', async () => {
    await until('bea has a chat row for the farm', () =>
      bea.client.cottage.getState().chats.some((c) => c.farm === farm),
    );
    await pip.client.send(farm, 'message', { text: 'bring a jumper' });
    await until('the row shows the newest message', () =>
      bea.client.cottage
        .getState()
        .chats.some((c) => c.farm === farm && c.preview === 'bring a jumper'),
    );
  });

  it('keeps a rejection final, even when the write is sent again', async () => {
    const first = await bea.client.send(farm, 'knock', { to: pip.person });
    expect(first.status).toBe('queued');
    await until('first knock acked', settled(bea));
    // The phone holds today's knock, so it refuses a second one itself, by the farm's own rules.
    const second = await bea.client.send(farm, 'knock', { to: pip.person });
    expect(second).toEqual({ status: 'refused', reason: 'limit_reached' });
    // Sent past the phone, the farm refuses it too, and answers the same when it comes again.
    const knock = { opId: newOpId(), kind: 'knock', payload: { to: pip.person } } as const;
    const refused = await bea.api.command(farm, knock);
    expect(refused).toEqual({ result: 'rejected', opId: knock.opId, reason: 'limit_reached' });
    expect(await bea.api.command(farm, knock)).toEqual(refused);
  });

  it('upgrades with an email code and keeps the person', async () => {
    const before = pip.person;
    const email = `pip-${Date.now()}@example.com`;
    await pip.signIn.sendEmailCode(email);
    let code: string | null = null;
    await until(
      'the code reached the local email log',
      () => (code = api.emailCode(email)) !== null,
    );
    const after = await pip.signIn.withEmailCode(email, code ?? '');
    expect(after).toEqual({ person: before, anonymous: false });
    const sent = await pip.client.send(farm, 'message', { text: 'signed in now' });
    expect(sent.status).toBe('queued');
    await until('a write after the upgrade is acked', settled(pip));
  });

  it('sorted every frame and event without a problem', () => {
    const problems = [...bea.reports, ...pip.reports].filter((r) => r.type !== 'failed');
    api.note(`reports: ${JSON.stringify([...bea.reports, ...pip.reports])}`);
    expect(problems).toEqual([]);
  });
});

/** The farm as the server holds it: a fresh store for this person takes the snapshot. */
async function snapshotAs(phone: Phone, head: number) {
  const fresh = new Phone(`${phone.name}-fresh`, api.base, phone.keychain);
  await fresh.launch();
  fresh.client.hold(farm);
  await until(
    'fresh store took the snapshot',
    async () => (await fresh.client.replica(farm)).getState().lastSeq >= head,
  );
  const confirmed = (await fresh.client.replica(farm)).getState().confirmed;
  fresh.kill();
  if (!confirmed) throw new Error('no snapshot');
  return confirmed;
}
