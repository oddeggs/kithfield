import { FarmNotificationsView, type PushJob } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_KNOCK_FOR } from '../../src/cottage/chats';
import { cottageOf } from '../../src/cottage/stub';
import { cottageClock } from '../../src/cottage/clock';
import { MIDDAY, recordPushQueue, useTestClock } from '../cottage-doubles';
import { api, cast, type Person, plantFarm, useTestPorts } from './support/doubles';

beforeEach(() => {
  useTestPorts();
  // Midday UTC on the cottage's clock: outside the quiet floor, so pushes go out.
  useTestClock(MIDDAY);
  recordPushQueue();
});

const view = async (person: Person, farm: string) => {
  const response = await api(person, 'GET', `/v1/farms/${farm}/notifications`);
  expect(response.status).toBe(200);
  return FarmNotificationsView.parse(response.body);
};

let seq = 100;
/** Three mentions sent from the farm and never opened, then a fourth: the kind rests. */
async function restMentions(person: Person, farm: string): Promise<void> {
  const cottage = cottageOf(env, person.id);
  await cottage.upsertFarm({ farm, farmKind: 'farm', name: 'The Thursday Lot', with: null });
  await cottage.registerDevice('phone-1', {
    platform: 'ios',
    name: 'Phone',
    pushToken: 'ExponentPushToken[x]',
    appVersion: '1.0.0 (1)',
  });
  const now = cottageClock.now();
  const job = (): PushJob => {
    seq += 1;
    return {
      person: person.id,
      farm,
      kind: 'message',
      seq,
      collapseKey: `mention.t.${seq}`,
      copy: { key: 'push.mention', params: { preview: 'hi' } },
      forYou: true,
      at: now,
    };
  };
  for (let i = 0; i < 3; i++) expect(await cottage.claim(job())).toMatchObject({ action: 'send' });
  expect(await cottage.push(job())).toBe('skip');
}

describe('a farm’s notifications for one person', () => {
  it('reads the defaults for someone who never changed them', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    expect(await view(pip, farm)).toEqual({
      mutedUntil: null,
      knockFor: DEFAULT_KNOCK_FOR,
      resting: [],
    });
  });

  it('reads back the mute and "Knock for", with "always" as it was set', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const knockFor = { plans: true, doorstep: false, mentions: true, messages: true };
    const set = await api(pip, 'PUT', `/v1/farms/${farm}/notifications`, {
      mutedUntil: 'always',
      knockFor,
    });
    expect(set.status).toBe(200);
    expect(await view(pip, farm)).toMatchObject({ mutedUntil: 'always', knockFor });

    const until = Date.now() + 3_600_000;
    await api(pip, 'PUT', `/v1/farms/${farm}/notifications`, { mutedUntil: until, knockFor });
    expect((await view(pip, farm)).mutedUntil).toBe(until);
    // A mute that has run out reads as none.
    await api(pip, 'PUT', `/v1/farms/${farm}/notifications`, {
      mutedUntil: Date.now() - 1000,
      knockFor,
    });
    expect((await view(pip, farm)).mutedUntil).toBeNull();
  });

  it('shows a kind resting after three unopened pushes, and turns it back on', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    await restMentions(pip, farm);
    const resting = (await view(pip, farm)).resting;
    expect(resting.map((r) => r.type)).toEqual(['mentions']);
    expect(resting[0]!.until).toBeGreaterThan(cottageClock.now() + 6 * 24 * 3_600_000);

    const woken = await api(pip, 'DELETE', `/v1/farms/${farm}/notifications/resting/mentions`);
    expect(woken.status).toBe(204);
    expect((await view(pip, farm)).resting).toEqual([]);
    // Turning on a kind that wasn't resting is fine too.
    const again = await api(pip, 'DELETE', `/v1/farms/${farm}/notifications/resting/plans`);
    expect(again.status).toBe(204);
  });

  it('turns down an unknown kind, and anyone who doesn’t live on the farm', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip);
    const odd = await api(pip, 'DELETE', `/v1/farms/${farm}/notifications/resting/streaks`);
    expect(odd.status).toBe(400);
    expect(odd.body).toEqual({ error: { code: 'bad_request', fields: ['type'] } });
    expect((await api(fig, 'GET', `/v1/farms/${farm}/notifications`)).status).toBe(404);
    const theirs = await api(fig, 'DELETE', `/v1/farms/${farm}/notifications/resting/plans`);
    expect(theirs.status).toBe(404);
    expect((await api(null, 'GET', `/v1/farms/${farm}/notifications`)).status).toBe(401);
  });
});
