import type { CottageDelivery, FarmState, SeedState } from '@kithfield/contracts';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cottageClock } from '../src/cottage/clock';
import { activityPorts } from '../src/cottage/live-activities';
import { type ApnsConfig, forgetProviderTokens } from '../src/push/apns';
import {
  critterImageOf,
  planDayState,
  planDayWindow,
  planLink,
  zonedTime,
} from '../src/surfaces/live-activity';
import { readRequest, testApnsKey } from './support/apns-key';
import { cottageWithFarm, freshPerson, recordPushQueue, useTestClock } from './cottage-doubles';

const seed = (over: Partial<SeedState> = {}): SeedState => ({
  seq: 20,
  planter: 'pip',
  unsent: false,
  title: 'Picnic by the river',
  days: [{ date: '2026-10-18', from: '16:00' }],
  place: { name: 'Willow bend' },
  yeses: 'most',
  someday: false,
  hat: 'pip',
  settleOn: null,
  votes: [],
  rsvps: [],
  checkins: [],
  sproutedAt: Date.UTC(2026, 9, 17),
  ...over,
});

const farmWith = (seeds: SeedState[], people: string[], fireLitAt: number | null = null) =>
  ({
    farm: 'farm-a',
    timeZone: 'UTC',
    members: people.map((person) => ({ person, name: person === 'fig' ? null : person })),
    seeds,
    fireLitAt,
  }) as unknown as FarmState;

describe('a plan’s day', () => {
  it('runs from two hours before it starts to two hours after, in the farm’s zone', () => {
    // London is still on summer time on 24 October 2026.
    expect(zonedTime('2026-10-24', '16:00', 'Europe/London')).toBe(Date.UTC(2026, 9, 24, 15));
    expect(zonedTime('2026-10-26', '16:00', 'Europe/London')).toBe(Date.UTC(2026, 9, 26, 16));
    expect(zonedTime('2026-10-24', '16:00', 'Asia/Ho_Chi_Minh')).toBe(Date.UTC(2026, 9, 24, 9));
    const window = planDayWindow(farmWith([seed()], []), seed());
    expect(window).toEqual({
      day: '2026-10-18',
      from: '16:00',
      startAt: Date.UTC(2026, 9, 18, 14),
      endAt: Date.UTC(2026, 9, 18, 18),
    });
  });

  it('has none until the plan sprouts with a day', () => {
    expect(planDayWindow(farmWith([], []), seed({ sproutedAt: null }))).toBeNull();
    const undecided = seed({ days: [{ date: '2026-10-18' }, { date: '2026-10-19' }] });
    expect(planDayWindow(farmWith([], []), undecided)).toBeNull();
  });

  it('shows who is there and who is on the way, each as the critter still the app writes', () => {
    const plan = seed({
      rsvps: [
        { person: 'bea', answer: 'in' },
        { person: 'fig', answer: 'in' },
        { person: 'otis', answer: 'out' },
      ],
      checkins: ['bea'],
    });
    expect(planDayState(farmWith([plan], ['pip', 'bea', 'fig', 'otis']), plan)).toEqual({
      here: [{ person: 'bea', name: 'bea', image: critterImageOf('bea') }],
      onTheWay: [
        { person: 'pip', name: 'pip', image: critterImageOf('pip') },
        { person: 'fig', name: null, image: critterImageOf('fig') },
      ],
    });
    expect(critterImageOf('person-1')).toBe('critter-5v9g1o0ndk.png');
    expect(planLink('dev', 'farm-a', 20)).toBe('kithfield-dev://seedbed/20?farm=farm-a');
  });
});

/* The cottage moving the person's activities over APNs. */

type Sent = { token: string; body: { aps: Record<string, unknown> } };
let sent: Sent[];
let farm: FarmState;
const saved = { ...activityPorts };

beforeEach(async () => {
  useTestClock('2026-10-18T12:00:00Z');
  forgetProviderTokens();
  sent = [];
  const { pem } = await testApnsKey();
  const config: ApnsConfig = {
    keyP8: pem,
    keyId: 'KEY1234567',
    teamId: 'YFND2EEW8S',
    bundleId: 'com.kithfield.app.dev',
    host: 'api.push.apple.com',
    relayUrl: null,
  };
  activityPorts.config = () => config;
  activityPorts.farmState = () => Promise.resolve(farm);
  activityPorts.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, body } = readRequest(input, init);
    sent.push({ token: url.split('/').pop() ?? '', body: body as Sent['body'] });
    return Promise.resolve(new Response(null, { status: 200 }));
  };
});

afterEach(() => {
  Object.assign(activityPorts, saved);
});

const PHONE_START = 'aa'.repeat(32);
const PHONE_PLAN = 'bb'.repeat(32);
const PHONE_FIRE = 'cc'.repeat(32);

async function personOnPhone() {
  recordPushQueue();
  const person = freshPerson();
  const cottage = await cottageWithFarm(person, 'farm-a');
  await cottage.registerDevice('phone-1', {
    platform: 'ios',
    name: 'iPhone',
    pushToken: null,
    appVersion: '1.0.0 (1)',
  });
  return { person, cottage };
}

const delivery = (seq: number, kind: string): CottageDelivery => ({
  farm: 'farm-a',
  seq,
  kind,
  actor: 'bea',
  at: cottageClock.now(),
  preview: null,
  forYou: false,
  connected: false,
});

describe('Live Activities from the server', () => {
  it('updates a running plan day when its people change, once per change', async () => {
    const { person, cottage } = await personOnPhone();
    await cottage.setActivityToken('phone-1', {
      activity: 'plan_day',
      farm: 'farm-a',
      seed: 20,
      token: PHONE_PLAN,
    });
    const plan = seed({ rsvps: [{ person, answer: 'in' }], checkins: ['pip'] });
    farm = farmWith([plan], ['pip', person]);
    await cottage.deliver(delivery(30, 'checkin'));
    await cottage.deliver(delivery(31, 'rsvp'));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.token).toBe(PHONE_PLAN);
    expect(sent[0]!.body.aps).toMatchObject({ event: 'update' });
    const content = sent[0]!.body.aps['content-state'] as { json: string };
    expect(JSON.parse(content.json)).toEqual({
      here: [{ person: 'pip', name: 'pip', image: critterImageOf('pip') }],
      onTheWay: [{ person, name: person, image: critterImageOf(person) }],
    });
  });

  it('starts the plan’s day on the person’s phones two hours before, then ends it', async () => {
    const { person, cottage } = await personOnPhone();
    await cottage.setActivityStartToken('phone-1', PHONE_START);
    farm = farmWith([seed({ rsvps: [{ person, answer: 'in' }] })], ['pip', person]);
    await cottage.deliver(delivery(30, 'rsvp'));
    expect(sent).toEqual([]);

    const stub = env.COTTAGE.get(env.COTTAGE.idFromName(person));
    useTestClock('2026-10-18T14:01:00Z');
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(sent).toHaveLength(1);
    expect(sent[0]!.token).toBe(PHONE_START);
    const aps = sent[0]!.body.aps;
    expect(aps).toMatchObject({
      event: 'start',
      'attributes-type': 'SurfaceAttributes',
      alert: { title: 'Picnic by the river' },
    });
    const attributes = aps['attributes'] as { kind: string; key: string; json: string };
    expect(attributes.kind).toBe('plan_day');
    expect(attributes.key).toBe('farm-a:20');
    expect(JSON.parse(attributes.json)).toEqual({
      farm: 'farm-a',
      seed: 20,
      title: 'Picnic by the river',
      place: 'Willow bend',
      date: '2026-10-18',
      from: '16:00',
      link: 'kithfield-dev://seedbed/20?farm=farm-a',
    });

    // The phone registered the running activity's token; two hours after, it ends.
    await cottage.setActivityToken('phone-1', {
      activity: 'plan_day',
      farm: 'farm-a',
      seed: 20,
      token: PHONE_PLAN,
    });
    useTestClock('2026-10-18T18:00:01Z');
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(sent.map((s) => [s.token, s.body.aps['event']])).toEqual([
      [PHONE_START, 'start'],
      [PHONE_PLAN, 'end'],
    ]);
    await runDurableObjectAlarm(stub);
    expect(sent).toHaveLength(2);
  });

  it('waits out the house floor before starting a morning plan', async () => {
    const { person, cottage } = await personOnPhone();
    await cottage.setActivityStartToken('phone-1', PHONE_START);
    const early = seed({
      days: [{ date: '2026-10-19', from: '09:00' }],
      rsvps: [{ person, answer: 'in' }],
    });
    farm = farmWith([early], [person]);
    await cottage.deliver(delivery(30, 'rsvp'));
    const stub = env.COTTAGE.get(env.COTTAGE.idFromName(person));
    // 07:01 UTC is inside the 22:00–08:00 floor: it starts at 08:00 instead.
    useTestClock('2026-10-19T07:01:00Z');
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(sent).toEqual([]);
    useTestClock('2026-10-19T08:00:30Z');
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(sent.map((s) => s.body.aps['event'])).toEqual(['start']);
  });

  it('ends the fire’s activity when the fire goes out', async () => {
    const { cottage } = await personOnPhone();
    await cottage.setActivityToken('phone-1', {
      activity: 'fire',
      farm: 'farm-a',
      token: PHONE_FIRE,
    });
    farm = farmWith([], [], Date.UTC(2026, 9, 18, 11));
    await cottage.deliver(delivery(30, 'fire'));
    expect(sent).toEqual([]);
    farm = farmWith([], [], null);
    await cottage.deliver(delivery(31, 'fire'));
    expect(sent.map((s) => [s.token, s.body.aps['event']])).toEqual([[PHONE_FIRE, 'end']]);
    // Its token is gone with it.
    await cottage.deliver(delivery(32, 'fire'));
    expect(sent).toHaveLength(1);
  });

  it('drops a token Apple no longer takes', async () => {
    const { person, cottage } = await personOnPhone();
    activityPorts.fetch = () =>
      Promise.resolve(Response.json({ reason: 'Unregistered' }, { status: 410 }));
    await cottage.setActivityToken('phone-1', {
      activity: 'fire',
      farm: 'farm-a',
      token: PHONE_FIRE,
    });
    await cottage.setActivityToken('phone-1', {
      activity: 'plan_day',
      farm: 'farm-a',
      seed: 20,
      token: PHONE_PLAN,
    });
    farm = farmWith([seed({ checkins: [person] })], [person]);
    await cottage.deliver(delivery(30, 'checkin'));
    const stub = env.COTTAGE.get(env.COTTAGE.idFromName(person));
    const left = await runInDurableObject(stub, (_i, state) =>
      state.storage.sql.exec('SELECT token FROM activity_tokens').toArray(),
    );
    expect(left).toEqual([{ token: PHONE_FIRE }]);
  });
});

describe('when the plan’s day doesn’t start from the server', () => {
  const knock = { plans: true, doorstep: true, mentions: true, messages: false };

  async function dueStart(prepare: (person: string) => Promise<void>) {
    const { person, cottage } = await personOnPhone();
    await cottage.setActivityStartToken('phone-1', PHONE_START);
    farm = farmWith([seed({ rsvps: [{ person, answer: 'in' }] })], ['pip', person]);
    await prepare(person);
    await cottage.deliver(delivery(30, 'rsvp'));
    const stub = env.COTTAGE.get(env.COTTAGE.idFromName(person));
    useTestClock('2026-10-18T14:01:00Z');
    await runInDurableObject(stub, (instance) => instance.alarm());
    return sent.filter((s) => s.body.aps['event'] === 'start');
  }

  it('starts when nothing holds it back', async () => {
    expect(await dueStart(() => Promise.resolve())).toHaveLength(1);
  });

  it('stays quiet on a muted farm', async () => {
    const starts = await dueStart(async (person) => {
      const cottage = env.COTTAGE.get(env.COTTAGE.idFromName(person));
      await cottage.setFarmNotifications('farm-a', { mutedUntil: 'always', knockFor: knock });
    });
    expect(starts).toEqual([]);
  });

  it('stays quiet when the person turned plans off for the farm', async () => {
    const starts = await dueStart(async (person) => {
      const cottage = env.COTTAGE.get(env.COTTAGE.idFromName(person));
      await cottage.setFarmNotifications('farm-a', {
        mutedUntil: null,
        knockFor: { ...knock, plans: false },
      });
    });
    expect(starts).toEqual([]);
  });

  it('stays quiet while the person hibernates', async () => {
    const starts = await dueStart(async (person) => {
      await env.COTTAGE.get(env.COTTAGE.idFromName(person)).setHibernating(true);
    });
    expect(starts).toEqual([]);
  });

  it('forgets a farm’s plan days and activity tokens when the person leaves it', async () => {
    const { person, cottage } = await personOnPhone();
    await cottage.setActivityStartToken('phone-1', PHONE_START);
    await cottage.setActivityToken('phone-1', {
      activity: 'plan_day',
      farm: 'farm-a',
      seed: 20,
      token: PHONE_PLAN,
    });
    farm = farmWith([seed({ rsvps: [{ person, answer: 'in' }] })], ['pip', person]);
    await cottage.deliver(delivery(30, 'rsvp'));
    await cottage.leaveFarm('farm-a');
    const stub = env.COTTAGE.get(env.COTTAGE.idFromName(person));
    const left = await runInDurableObject(stub, (_i, state) => ({
      days: state.storage.sql.exec('SELECT farm FROM plan_days').toArray(),
      tokens: state.storage.sql.exec('SELECT farm FROM activity_tokens').toArray(),
    }));
    expect(left).toEqual({ days: [], tokens: [] });
    useTestClock('2026-10-18T14:01:00Z');
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(sent.filter((s) => s.body.aps['event'] === 'start')).toEqual([]);
  });
});

describe('a farm the cottage doesn’t know', () => {
  it('never starts a plan’s day', async () => {
    recordPushQueue();
    const person = freshPerson();
    const cottage = env.COTTAGE.get(env.COTTAGE.idFromName(person));
    await cottage.registerDevice('phone-1', {
      platform: 'ios',
      name: 'iPhone',
      pushToken: null,
      appVersion: '1.0.0 (1)',
    });
    await cottage.setActivityStartToken('phone-1', PHONE_START);
    farm = farmWith([seed({ rsvps: [{ person, answer: 'in' }] })], ['pip', person]);
    await cottage.deliver(delivery(30, 'rsvp'));
    useTestClock('2026-10-18T14:01:00Z');
    await runInDurableObject(cottage, (instance) => instance.alarm());
    expect(sent).toEqual([]);
  });
});
