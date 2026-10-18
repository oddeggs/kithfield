import { type CottageDelivery, type Critter, QuickTendList } from '@kithfield/contracts';
import { exports } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { whyOf } from '../src/cottage/quick-tend';
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
  recordPushQueue();
});

const api = (person: string, method: string, path: string, body?: unknown) =>
  exports.default.fetch(`https://dev.kithfield.com/api${path}`, {
    method,
    headers: { ...testSession(person), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const sheep: Critter = {
  species: 'sheep',
  coat: 'amber',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
};

/** A person on a farm and on a visit with Bea. */
async function personWithChats() {
  const person = freshPerson();
  const cottage = await cottageWithFarm(person, 'farm-a');
  await cottage.upsertFarm({
    farm: 'visit-b',
    farmKind: 'visit',
    name: null,
    with: { person: 'bea', name: 'Bea', critter: sheep },
  });
  return { person, cottage };
}

let at = Date.parse(MIDDAY);
const delivery = (over: Partial<CottageDelivery> & { farm: string; seq: number }) => {
  at += 1000;
  return {
    kind: 'message',
    actor: 'otis',
    at,
    preview: null,
    forYou: true,
    connected: false,
    ...over,
  } satisfies CottageDelivery;
};

async function quickTend(person: string): Promise<QuickTendList> {
  const response = await api(person, 'GET', '/v1/quick-tend');
  expect(response.status).toBe(200);
  return QuickTendList.parse(await response.json());
}

describe('Quick Tend', () => {
  it('lists what waits across farms and visits, newest first, with why each waits', async () => {
    const { person, cottage } = await personWithChats();
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, preview: 'chairs on Saturday?' }));
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 3, kind: 'seed_planted' }));
    await cottage.deliver(delivery({ farm: 'visit-b', seq: 4, kind: 'firefly', actor: 'bea' }));
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 5, preview: '@june hi' }));
    // Not meant for the person, or seen with the farm open: nothing waits.
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 6, forYou: false, preview: 'hey' }));
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 7, connected: true, preview: 'yo' }));

    const { items } = await quickTend(person);
    expect(items.map((i) => [i.farm, i.seq, i.kind, i.why, i.preview])).toEqual([
      ['farm-a', 5, 'message', 'mention', '@june hi'],
      ['visit-b', 4, 'firefly', 'doorstep', null],
      ['farm-a', 3, 'seed_planted', 'plan', null],
      ['farm-a', 2, 'message', 'question', 'chairs on Saturday?'],
    ]);
    expect(items[0]).toMatchObject({
      farmKind: 'farm',
      name: 'The Thursday Lot',
      with: null,
      actor: 'otis',
    });
    expect(items[1]).toMatchObject({
      farmKind: 'visit',
      name: null,
      with: { person: 'bea', name: 'Bea' },
    });
  });

  it('takes a farm’s items off once the person tends it, and leaves other farms’', async () => {
    const { person, cottage } = await personWithChats();
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, preview: 'chairs?' }));
    await cottage.deliver(delivery({ farm: 'visit-b', seq: 3, kind: 'firefly', actor: 'bea' }));
    await cottage.deliver(
      delivery({ farm: 'farm-a', seq: 4, actor: person, forYou: false, kind: 'sticker' }),
    );
    expect((await quickTend(person)).items.map((i) => [i.farm, i.seq])).toEqual([['visit-b', 3]]);
  });

  it('is empty for someone with nothing waiting', async () => {
    expect(await quickTend(freshPerson())).toEqual({ items: [] });
    const anonymous = await exports.default.fetch('https://dev.kithfield.com/api/v1/quick-tend');
    expect(anonymous.status).toBe(401);
  });

  it('names why from the kind and the words', () => {
    expect(whyOf('vote', null)).toBe('plan');
    expect(whyOf('gift', null)).toBe('doorstep');
    expect(whyOf('slow_post', null)).toBe('doorstep');
    expect(whyOf('card_signed', null)).toBe('birthday');
    expect(whyOf('hibernate', null)).toBe('back');
    expect(whyOf('message', 'free Saturday? ')).toBe('question');
    expect(whyOf('voice', null)).toBe('mention');
  });

  it('holds at most 99 items', async () => {
    const { person, cottage } = await personWithChats();
    for (let s = 2; s < 104; s++) {
      await cottage.deliver(delivery({ farm: 'farm-a', seq: s, kind: 'wave', preview: null }));
    }
    const { items } = await quickTend(person);
    expect(items).toHaveLength(99);
    expect(items[0]!.seq).toBe(103);
  });
});

describe('pinning a chat', () => {
  it('pins and unpins a farm on the chat list', async () => {
    const { person, cottage } = await personWithChats();
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, forYou: false }));
    await cottage.deliver(delivery({ farm: 'visit-b', seq: 3, forYou: false, actor: 'bea' }));
    expect((await cottage.chatList()).map((r) => [r.farm, r.pinned])).toEqual([
      ['visit-b', false],
      ['farm-a', false],
    ]);

    expect((await api(person, 'PATCH', '/v1/chats/farm-a', { pinned: true })).status).toBe(204);
    expect((await cottage.chatList()).map((r) => [r.farm, r.pinned])).toEqual([
      ['farm-a', true],
      ['visit-b', false],
    ]);
    expect((await api(person, 'PATCH', '/v1/chats/farm-a', { pinned: false })).status).toBe(204);
    expect((await cottage.chatList())[0]).toMatchObject({ farm: 'visit-b', pinned: false });
  });

  it('answers 404 for a farm the person isn’t on and 400 for a bad body', async () => {
    const { person } = await personWithChats();
    const unknown = await api(person, 'PATCH', '/v1/chats/farm-z', { pinned: true });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: { code: 'not_found' } });
    const bad = await api(person, 'PATCH', '/v1/chats/farm-a', { pinned: 'yes' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: 'bad_request', fields: ['pinned'] } });
  });
});
