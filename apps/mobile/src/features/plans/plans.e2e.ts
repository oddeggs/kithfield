import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CreateFarmResponse, FarmState, RememberList } from '@kithfield/contracts';
import { addDays, farmView, leadingOptions, planDay } from '@kithfield/farm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Phone } from '../../../e2e/person';
import { startLocalApi, type LocalApi } from '../../../e2e/wrangler';
import { plantPayload } from './draft';
import { memoryPlantedStore, plantAndJoin, settlePlanted } from './planted';
import { bedKindOf, stageOf } from './plan-status';

/*
 * A plan between two friends against `wrangler dev`: planted, voted on, answered, sprouted and
 * checked into by both, with the seed growing the same on each phone and on the server.
 */

const env = process.env as Partial<Record<string, string>>;
const PORT = Number(env['E2E_PORT'] ?? 8805);
const TRANSCRIPT = env['E2E_TRANSCRIPT'] ?? join(tmpdir(), `kithfield-plans-e2e-${Date.now()}.log`);

const critter = (species: string) => ({
  species,
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
});

let api: LocalApi;
let bea: Phone;
let pip: Phone;
let fig: Phone;
let otis: Phone;
const planted = memoryPlantedStore();
let farm = '';
let seq = 0;
let today = '';

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 15_000) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  api.note(`ok: ${what}`);
}

const state = async (phone: Phone) => (await phone.client.replica(farm)).getState();
const confirmed = async (phone: Phone): Promise<FarmState> => {
  const s = (await state(phone)).confirmed;
  if (!s) throw new Error(`${phone.name} holds no farm`);
  return s;
};
const seedOn = async (phone: Phone) => (await confirmed(phone)).seeds.find((s) => s.seq === seq);
const settled = (phone: Phone) => async () => (await state(phone)).pending.length === 0;
const level = async () => (await state(bea)).lastSeq === (await state(pip)).lastSeq;

beforeAll(async () => {
  mkdirSync(join(TRANSCRIPT, '..'), { recursive: true });
  writeFileSync(TRANSCRIPT, `Kithfield plans end-to-end run, ${new Date().toISOString()}\n`);
  api = await startLocalApi(PORT, TRANSCRIPT);
  bea = new Phone('bea', api.base);
  pip = new Phone('pip', api.base);
  fig = new Phone('fig', api.base);
  otis = new Phone('otis', api.base);
}, 120_000);

afterAll(() => {
  for (const phone of [bea, pip, fig, otis]) {
    try {
      phone?.kill();
    } catch {
      // Never launched.
    }
  }
  api?.stop();
  console.log(`transcript: ${TRANSCRIPT}`);
});

describe('a plan between two friends', () => {
  it('starts with a farm both live on', async () => {
    for (const [phone, species] of [
      [bea, 'sheep'],
      [pip, 'hedgehog'],
    ] as const) {
      const me = await phone.session.ensure();
      api.sql(
        `UPDATE people SET display_name = '${phone.name}', critter = '${JSON.stringify(critter(species))}', age_ok = 1 WHERE id = '${me.person}'`,
      );
      await phone.launch();
    }
    const created = await bea.call<CreateFarmResponse>('POST', '/v1/farms', {
      name: 'The Thursday Lot',
      land: 'meadow',
      timeZone: 'UTC',
      hemisphere: 'north',
    });
    farm = created.farm;
    await pip.call('POST', `/v1/invites/${created.invite.code}/join`, {
      name: 'pip',
      critter: critter('hedgehog'),
    });
    bea.client.hold(farm);
    pip.client.hold(farm);
    await until('bea live', () => bea.client.link(farm).status === 'live');
    await until('pip live', () => pip.client.link(farm).status === 'live');
    await until('both see two members', async () => (await confirmed(bea)).members.length === 2);
    today = farmView(await confirmed(bea), Date.now()).today;
  });

  it('plants a seed with two days to lean on', async () => {
    const payload = plantPayload({
      title: 'Picnic by the river',
      days: [today, addDays(today, 1)],
      place: 'Willow bend, Hollow Creek',
      yeses: 'couple',
    });
    const sent = await plantAndJoin(bea.client, planted, farm, bea.person, payload);
    expect(sent.status).toBe('queued');
    await until('the seed is planted', settled(bea));
    const seed = (await confirmed(bea)).seeds.find((s) => s.title === 'Picnic by the river');
    if (!seed) throw new Error('no seed');
    seq = seed.seq;
    // The planter's own yes follows once the farm has numbered the plan.
    await until('bea said yes', async () => (await settlePlanted(bea.client, planted, bea.person)) === 0);
    await until('bea is in', async () =>
      ((await seedOn(bea))?.rsvps ?? []).some((r) => r.person === bea.person && r.answer === 'in'),
    );
    await until('pip has the seed', async () => (await seedOn(pip)) !== undefined);
    const view = farmView(await confirmed(pip), Date.now());
    const plan = view.plans.find((p) => p.seed.seq === seq);
    // A place but not one day yet: a little sprout, and friends are picking.
    expect(plan && stageOf(plan.seed, plan.conditions)).toBe(1);
    expect(plan && bedKindOf(plan.seed, plan.conditions, today)).toBe('picking');
  });

  it('leans on buds and answers', async () => {
    await bea.client.send(farm, 'vote', { seed: seq, option: 0, on: true });
    await pip.client.send(farm, 'vote', { seed: seq, option: 1, on: true });
    await pip.client.send(farm, 'vote', { seed: seq, option: 1, on: false });
    await pip.client.send(farm, 'vote', { seed: seq, option: 0, on: true });
    await pip.client.send(farm, 'rsvp', { seed: seq, answer: 'in' });
    await until('bea settled', settled(bea));
    await until('pip settled', settled(pip));
    await until('both at the same seq', level);
    for (const phone of [bea, pip]) {
      const seed = await seedOn(phone);
      expect(seed && leadingOptions(seed)).toEqual([0]);
      expect(seed?.votes).toEqual([{ option: 0, people: [bea.person, pip.person] }]);
      expect(seed?.sproutedAt).toBeNull();
    }
  });

  it('sprouts once the day settles, the same on both phones', async () => {
    await bea.client.send(farm, 'seed_changed', { seed: seq, settleOn: today });
    await until('the settle is in', settled(bea));
    await until('both at the same seq', level);
    const seeds = await Promise.all([bea, pip].map(seedOn));
    expect(seeds[0]?.sproutedAt).not.toBeNull();
    expect(seeds[0]).toEqual(seeds[1]);
    const seed = seeds[0];
    expect(seed && planDay(seed)).toBe(today);
    const view = farmView(await confirmed(bea), Date.now());
    const plan = view.plans.find((p) => p.seed.seq === seq);
    expect(plan && bedKindOf(plan.seed, plan.conditions, today)).toBe('today');
  });

  it('passes the hat', async () => {
    await bea.client.send(farm, 'seed_changed', { seed: seq, hat: pip.person });
    await until('the hat passed', settled(bea));
    await until('pip wears the hat', async () => (await seedOn(pip))?.hat === pip.person);
  });

  it('checks two friends in at the fire: alone it grows nothing, together it grows', async () => {
    // Two friends who haven't tended the farm today, so the hangout's dew isn't capped.
    for (const [phone, species] of [
      [fig, 'frog'],
      [otis, 'owl'],
    ] as const) {
      const me = await phone.session.ensure();
      api.sql(
        `UPDATE people SET display_name = '${phone.name}', critter = '${JSON.stringify(critter(species))}', age_ok = 1 WHERE id = '${me.person}'`,
      );
      await phone.launch();
      const invite = await bea.call<{ code: string }>('POST', `/v1/farms/${farm}/invites`, {
        expiresAt: null,
      });
      await phone.call('POST', `/v1/invites/${invite.code}/join`, {
        name: phone.name,
        critter: critter(species),
      });
      phone.client.hold(farm);
      await until(`${phone.name} live`, () => phone.client.link(farm).status === 'live');
    }
    const gatheringsDew = async (phone: Phone) => {
      const state = await confirmed(phone);
      const plant = farmView(state, Date.now()).plants.find((p) => p.family === 'gatherings');
      return state.plants.find((p) => p.plant === plant?.plant)?.dew ?? 0;
    };
    // Arriving can bring shared rain (three friends opening the farm at once): let it land first.
    await new Promise((r) => setTimeout(r, 500));
    await until('everyone at the same seq', async () => {
      const seqs = await Promise.all([bea, pip, fig, otis].map(async (p) => (await state(p)).lastSeq));
      return seqs.every((s) => s === seqs[0]);
    });
    const before = await gatheringsDew(bea);

    await fig.client.send(farm, 'checkin', { seed: seq });
    await until('fig is here', settled(fig));
    await until('bea sees fig', async () => (await seedOn(bea))?.checkins.length === 1);
    expect(await gatheringsDew(bea)).toBe(before);

    await otis.client.send(farm, 'checkin', { seed: seq });
    await until('otis is here', settled(otis));
    await until('bea sees otis', async () => (await seedOn(bea))?.checkins.length === 2);
    await until('both at the same seq', level);
    // A hangout of two gives each of them three (less whatever they already gave today).
    expect(await gatheringsDew(bea)).toBeGreaterThan(before);
    const [b, p] = await Promise.all([confirmed(bea), confirmed(pip)]);
    expect((await seedOn(bea))?.checkins).toEqual([fig.person, otis.person]);
    expect(b.seeds).toEqual(p.seeds);
    expect(b.plants).toEqual(p.plants);
    expect(b.familyTendedAt).toEqual(p.familyTendedAt);
  });

  it('matches the server', async () => {
    const fresh = new Phone('pip-fresh', api.base, pip.keychain);
    await fresh.launch();
    fresh.client.hold(farm);
    const head = (await state(pip)).lastSeq;
    await until(
      'a fresh store caught up',
      async () => (await fresh.client.replica(farm)).getState().lastSeq >= head,
    );
    const server = (await fresh.client.replica(farm)).getState().confirmed;
    fresh.kill();
    const now = Date.now();
    expect(server && farmView(server, now)).toEqual(farmView(await confirmed(bea), now));
  });

  it('keeps a remember-me seed out of the farm', async () => {
    const head = (await state(bea)).lastSeq;
    const made = await bea.api.remember({
      farm,
      about: pip.person,
      title: "pip's interview, Thursday",
      nudgeAt: Date.now() + 86_400_000,
    });
    expect(made.id).toBeTruthy();
    const list = await bea.call<RememberList>('GET', '/v1/remember');
    expect(list.seeds.map((s) => s.id)).toContain(made.id);
    const theirs = await pip.call<RememberList>('GET', '/v1/remember');
    expect(theirs.seeds).toEqual([]);
    await new Promise((r) => setTimeout(r, 300));
    expect((await state(bea)).lastSeq).toBe(head);
  });
});
