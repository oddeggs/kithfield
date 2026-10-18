import type { PushJob } from '@kithfield/contracts';
import { exports } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cottageClock } from '../src/cottage/clock';
import { REST_MS } from '../src/cottage/resting';
import {
  cottageWithFarm,
  freshPerson,
  ledgerOf,
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

/** A person with a phone to push to and two farms on their chat list. */
async function personWithPhone() {
  const person = freshPerson();
  const cottage = await cottageWithFarm(person, 'farm-a');
  await cottage.upsertFarm({ farm: 'farm-b', farmKind: 'farm', name: 'Willow Bend', with: null });
  await cottage.registerDevice('phone-1', {
    platform: 'ios',
    name: 'June’s iPhone',
    pushToken: 'ExponentPushToken[june]',
    appVersion: '1.0.0 (1)',
  });
  return { person, cottage };
}

let seq = 10;
/** A mention of the person (a "mentions" push), each with its own seq. */
const mention = (person: string, over: Partial<PushJob> = {}): PushJob => {
  seq += 1;
  return {
    person,
    farm: 'farm-a',
    kind: 'message',
    seq,
    collapseKey: `mention.a.${seq}`,
    copy: { key: 'push.mention', params: { name: 'Otis', preview: 'chairs?' } },
    forYou: true,
    at: cottageClock.now(),
    ...over,
  };
};

type Cottage = Awaited<ReturnType<typeof personWithPhone>>['cottage'];

/** Hands a job to the consumer's last check, as it does before sending; the push's id. */
async function sent(cottage: Cottage, job: PushJob): Promise<string> {
  const claim = await cottage.claim(job);
  if (claim.action !== 'send') throw new Error(`not sent: ${JSON.stringify(claim)}`);
  return claim.push;
}

const opened = (person: string, id: unknown) =>
  exports.default.fetch('https://dev.kithfield.com/api/v1/push/opened', {
    method: 'POST',
    headers: { ...testSession(person), 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });

describe('kinds of push resting after unopened ones', () => {
  it('rests a kind on a farm for a week once three of its pushes in a row went unopened', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    for (let i = 0; i < 3; i++) await sent(cottage, mention(person));
    expect(await cottage.restingOn('farm-a')).toEqual([]);

    expect(await cottage.push(mention(person))).toBe('skip');
    expect((await ledgerOf(person)).at(-1)).toMatchObject({
      decision: 'skipped',
      reason: 'resting',
    });
    const now = cottageClock.now();
    const resting = await cottage.restingOn('farm-a');
    expect(resting.map((r) => r.type)).toEqual(['mentions']);
    expect(resting[0]!.until - now).toBeGreaterThan(REST_MS - 60_000);
    expect(resting[0]!.until - now).toBeLessThanOrEqual(REST_MS);

    // A push already decided on rests too, at the last check.
    expect(await cottage.claim(mention(person))).toEqual({ action: 'skip', reason: 'resting' });
    // Other kinds, and the same kind on another farm, still go.
    expect(await cottage.restingOn('farm-b')).toEqual([]);
    expect(await cottage.push(mention(person, { farm: 'farm-b' }))).toBe('send');
    const doorstep = mention(person, {
      kind: 'firefly',
      collapseKey: 'doorstep.20261018',
      copy: { key: 'push.doorstep.firefly', params: { name: 'Otis' } },
    });
    expect(await cottage.push(doorstep)).toBe('send');

    // A week on, it wakes, and the three before the rest no longer count.
    useTestClock(new Date(Date.parse(MIDDAY) + REST_MS + 60_000).toISOString());
    expect(await cottage.restingOn('farm-a')).toEqual([]);
    expect(await cottage.push(mention(person))).toBe('send');
  });

  it('starts counting again after a push is opened', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    await sent(cottage, mention(person));
    const second = await sent(cottage, mention(person));
    await sent(cottage, mention(person));
    expect((await opened(person, second)).status).toBe(204);
    expect(await cottage.push(mention(person))).toBe('send');
    expect(await cottage.restingOn('farm-a')).toEqual([]);
  });

  it('remembers a push the consumer retries once, by its id', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    const job = mention(person);
    const first = await sent(cottage, job);
    expect(await sent(cottage, job)).toBe(first);
    await sent(cottage, mention(person));
    // Only two different pushes went unopened: not yet a rest.
    expect(await cottage.push(mention(person))).toBe('send');
  });

  it('never rests knocks, who moved in or remember-me seeds', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    const joined = (n: number) =>
      mention(person, {
        kind: 'joined',
        collapseKey: `farm.a.${n}`,
        copy: { key: 'push.joined', params: { name: 'Dot' } },
        forYou: false,
      });
    for (let i = 0; i < 4; i++) await sent(cottage, joined(i));
    expect(await cottage.claim(joined(9))).toMatchObject({ action: 'send' });
    expect(await cottage.restingOn('farm-a')).toEqual([]);
  });

  it('turns a resting kind back on, and only later pushes count towards the next rest', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    for (let i = 0; i < 3; i++) await sent(cottage, mention(person));
    expect(await cottage.push(mention(person))).toBe('skip');
    await cottage.wakeResting('farm-a', 'mentions');
    expect(await cottage.restingOn('farm-a')).toEqual([]);
    expect(await cottage.push(mention(person))).toBe('send');
  });

  it('answers an opened push the same whatever its id, and checks the body', async () => {
    const person = freshPerson();
    expect((await opened(person, 'p-not-a-push')).status).toBe(204);
    expect((await opened(person, 'not ok!')).status).toBe(400);
    const anonymous = await exports.default.fetch('https://dev.kithfield.com/api/v1/push/opened', {
      method: 'POST',
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(anonymous.status).toBe(401);
  });
});
