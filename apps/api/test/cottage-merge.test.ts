import type { CottageDelivery } from '@kithfield/contracts';
import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ACTION_KEY_HEADER,
  type ActionKeyVariables,
  requireActionKey,
} from '../src/cottage/action-key';
import { cottageClock } from '../src/cottage/clock';
import { mergeInto } from '../src/cottage/merge';
import { handlePersonMerged } from '../src/cottage/person-merged';
import { cottageOf } from '../src/cottage/stub';
import type { Bindings } from '../src/env';
import {
  cottageWithFarm,
  freshPerson,
  MIDDAY,
  recordPushQueue,
  testSession,
  useTestClock,
  useTestSignInDouble,
} from './cottage-doubles';

beforeAll(() => useTestSignInDouble());
beforeEach(() => {
  useTestClock(MIDDAY);
});

const delivery = (over: Partial<CottageDelivery> & { farm: string; seq: number }) =>
  ({
    kind: 'message',
    actor: 'otis',
    at: cottageClock.now(),
    preview: 'hello',
    forYou: false,
    connected: false,
    ...over,
  }) satisfies CottageDelivery;

const phone = (pushToken: string) => ({
  platform: 'ios' as const,
  name: 'Phone',
  pushToken,
  appVersion: '1.0.0',
});

/** Registers a device over HTTP, as the app does, and answers its action key. */
async function register(person: string, device: string, token: string): Promise<string> {
  const response = await exports.default.fetch(
    `https://dev.kithfield.com/api/v1/devices/${device}`,
    {
      method: 'PUT',
      headers: { ...testSession(person), 'content-type': 'application/json' },
      body: JSON.stringify(phone(token)),
    },
  );
  return (await response.json<{ actionKey: string }>()).actionKey;
}

const keyed = new Hono<{ Bindings: Bindings; Variables: ActionKeyVariables }>().get(
  '/who',
  requireActionKey(),
  (c) => c.json({ person: c.get('actionPerson') }),
);

describe('merging two people’s cottages', () => {
  it('moves everything into the kept cottage, empties the other, and is safe to run twice', async () => {
    recordPushQueue();
    const from = freshPerson('anon');
    const into = freshPerson('kept');
    const shared = `ExponentPushToken[${from}]`;

    // The kept person: an older view of farm-a, and a phone holding the same token, registered first.
    const kept = await cottageWithFarm(into, 'farm-a');
    await kept.deliver(delivery({ farm: 'farm-a', seq: 5 }));
    // Straight into the cottage, so only the merge can settle who keeps the token.
    await kept.registerDevice(`kept-phone-${into}`, phone(shared));

    // The anonymous person: newer farm-a, a firefly waiting on farm-b, a phone, a seed, settings.
    useTestClock('2026-10-18T12:05:00Z');
    const anon = await cottageWithFarm(from, 'farm-a');
    await anon.upsertFarm({ farm: 'farm-b', farmKind: 'farm', name: 'Allotment', with: null });
    await anon.pinFarm('farm-b', true);
    await anon.deliver(delivery({ farm: 'farm-a', seq: 7, preview: 'newer' }));
    await anon.deliver(
      delivery({ farm: 'farm-b', seq: 3, kind: 'firefly', preview: null, forYou: true }),
    );
    const anonKey = await register(from, `anon-phone-${from}`, shared);
    const seed = await anon.plantSeed({
      farm: 'farm-a',
      about: 'bea',
      title: 'Bea’s interview, Thursday',
      nudgeAt: cottageClock.now() + 86_400_000,
    });
    await anon.updateSettings({ lang: 'vi', timeZone: 'Asia/Ho_Chi_Minh' });

    const job = { kind: 'person_merged' as const, from, into, at: cottageClock.now() };
    await handlePersonMerged(env, job);
    await handlePersonMerged(env, job);

    const list = await kept.chatList();
    expect(list.map((c) => [c.farm, c.seq, c.preview, c.waiting, c.pinned])).toEqual([
      ['farm-b', 3, null, 1, true],
      ['farm-a', 7, 'newer', 0, false],
    ]);
    expect(await kept.waiting()).toHaveLength(1);
    expect((await kept.listSeeds()).map((s) => s.id)).toEqual([seed]);
    expect((await kept.settings()).settings).toMatchObject({
      lang: 'vi',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    // Both phones come over; the token stays with the one registered last.
    const phones = await kept.listDevices();
    expect(phones.map((d) => [d.device, d.pushToken]).sort()).toEqual([
      [`anon-phone-${from}`, shared],
      [`kept-phone-${into}`, null],
    ]);
    // The anonymous phone's action key now speaks for the kept person.
    const who = await keyed.request('/who', { headers: { [ACTION_KEY_HEADER]: anonKey } }, env);
    expect(await who.json()).toEqual({ person: into });

    // The merged cottage is empty.
    expect(await anon.chatList()).toEqual([]);
    expect(await anon.listDevices()).toEqual([]);
    expect(await anon.listSeeds()).toEqual([]);
    expect(await anon.waiting()).toEqual([]);
  });

  it('takes the same rows twice without duplicates, as after a merge cut short before clearing', async () => {
    recordPushQueue();
    const from = freshPerson('anon');
    const into = freshPerson('kept');
    const anon = await cottageWithFarm(from, 'farm-a');
    await anon.deliver(
      delivery({ farm: 'farm-a', seq: 3, kind: 'firefly', preview: null, forYou: true }),
    );
    await anon.plantSeed({
      farm: 'farm-a',
      about: 'bea',
      title: 'Exams',
      nudgeAt: 1e13 /* far off: the alarm still sets */,
    });
    await anon.registerDevice('anon-phone', phone(`ExponentPushToken[${from}]`));
    const rows = await anon.exportForMerge();
    const kept = cottageOf(env, into);
    await runInDurableObject(kept, (_instance, state) => {
      mergeInto(state.storage.sql, rows, into);
      mergeInto(state.storage.sql, rows, into);
    });
    expect(await kept.chatList()).toHaveLength(1);
    expect(await kept.waiting()).toHaveLength(1);
    expect(await kept.listSeeds()).toHaveLength(1);
    expect(await kept.listDevices()).toHaveLength(1);
  });

  it('keeps the kept person’s own settings', async () => {
    const from = freshPerson('anon');
    const into = freshPerson('kept');
    await cottageOf(env, into).updateSettings({ lang: 'en', nudges: 'off' });
    await cottageOf(env, from).updateSettings({ lang: 'vi' });
    await handlePersonMerged(env, { kind: 'person_merged', from, into, at: 0 });
    expect((await cottageOf(env, into).settings()).settings).toMatchObject({
      lang: 'en',
      nudges: 'off',
    });
  });

  it('does nothing when a person is merged into themselves', async () => {
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    await cottage.absorb(person);
    expect(await cottage.chatList()).toHaveLength(1);
  });
});
