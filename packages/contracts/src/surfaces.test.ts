import { describe, expect, it } from 'vitest';

import { FarmCommand } from './commands';
import { type PlanPushData, type PushData } from './cottage';
import * as surfaces from './surfaces';
import { at, bea, critter, farm, opId, pip } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const person = { person: bea, name: 'Bea', image: 'bea-critter.png' };
const surfaceCritter = {
  ...person,
  critter,
  joinedAt: at,
  lastOpenedAt: at,
  lastWokenAt: null,
  hibernating: false,
  pausedUntil: null,
  link: 'kithfield://farm/f_thursday_lot/critter/p_bea',
};
const surfaceFarm = {
  farm,
  kind: 'farm',
  name: 'The Thursday Lot',
  with: null,
  season: { season: 'autumn', year: 2026 },
  images: { day: 'f_thursday_lot-day.png', night: 'f_thursday_lot-night.png' },
  critters: [surfaceCritter],
  fire: { litAt: at, people: [person] },
  nextPlan: {
    seed: 20,
    title: 'Picnic by the river',
    date: '2026-10-24',
    from: '16:00',
    place: 'Willow bend',
  },
  knocks: [{ from: pip, at }],
  weather: { day: '2026-10-18', weather: 'rain', source: 'weatherkit' },
  link: 'kithfield://farm/f_thursday_lot',
  updatedAt: at,
};
const visit = {
  ...surfaceFarm,
  kind: 'visit',
  name: null,
  with: person,
  fire: null,
  nextPlan: null,
  knocks: [],
  weather: null,
};
const planDay = {
  attributes: {
    farm,
    seed: 20,
    title: 'Picnic by the river',
    place: 'Willow bend',
    date: '2026-10-24',
    from: '16:00',
    link: 'kithfield://farm/f_thursday_lot/plan/20',
  },
  state: { here: [person], onTheWay: [{ ...person, person: pip, name: 'Pip' }] },
};
const fireActivity = {
  attributes: { farm, farmName: 'The Thursday Lot', link: 'kithfield-dev://fire/f_thursday_lot' },
  state: { people: [person], talking: bea, muted: true, listening: false },
};
const token = 'a'.repeat(64);
const draft = {
  opId,
  farm,
  at,
  text: 'look at this',
  url: 'https://example.com/picnic',
  files: [{ path: 'surfaces/share-outbox/photo-1.jpg', mime: 'image/jpeg', bytes: 812_000 }],
};

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
  SurfaceImage: [
    ['bea-critter.png', 'f_thursday_lot-night.png'],
    ['bea.jpg', '../x.png', ''],
  ],
  SurfaceLink: [
    ['kithfield://farm/f_thursday_lot', 'kithfield-dev://fire/f1?join=1'],
    ['https://kithfield.com/i/abc', 'kithfield://farm/<script>'],
  ],
  SurfacePerson: [[person, { ...person, name: null }], [{ ...person, image: 'bea' }]],
  SurfaceCritter: [[surfaceCritter], [{ ...surfaceCritter, lastOpenedAt: 'today' }]],
  SurfaceFarm: [
    [surfaceFarm, visit],
    [
      { ...surfaceFarm, images: { day: 'day.png' } },
      { ...surfaceFarm, nextPlan: { ...surfaceFarm.nextPlan, from: '4pm' } },
      { ...surfaceFarm, kind: 'valley' },
    ],
  ],
  SurfaceData: [
    [{ version: 1, lang: 'vi', writtenAt: at, farms: [surfaceFarm, visit] }],
    [
      { version: 2, lang: 'en', writtenAt: at, farms: [] },
      { version: 1, lang: 'fr', writtenAt: at, farms: [] },
    ],
  ],
  PlanDayActivity: [
    [planDay, { ...planDay, state: { here: [], onTheWay: [] } }],
    [
      { ...planDay, attributes: { ...planDay.attributes, seed: 0 } },
      { attributes: planDay.attributes },
    ],
  ],
  FireActivity: [
    [fireActivity, { ...fireActivity, state: { ...fireActivity.state, talking: null } }],
    [{ ...fireActivity, state: { ...fireActivity.state, muted: 'yes' } }],
  ],
  ActivityPushToken: [
    [token, 'f'.repeat(160)],
    ['A'.repeat(64), 'abc', ''],
  ],
  ActivityStartTokenRequest: [
    [{ token }, { token, bundleId: 'com.kithfield.app.dev' }],
    [{ token: 'nope' }, { token, bundleId: 'com kithfield app' }],
  ],
  ActivityTokenRequest: [
    [
      { activity: 'plan_day', farm, seed: 20, token },
      { activity: 'fire', farm, token, bundleId: 'com.kithfield.app' },
    ],
    [
      { activity: 'plan_day', farm, token },
      { activity: 'call', farm, token },
      { activity: 'fire', farm, token, bundleId: '' },
    ],
  ],
  SurfaceRefreshData: [
    [
      { refresh: 'widgets', farm, reason: 'fire' },
      { refresh: 'activity', farm, reason: 'plan' },
    ],
    [{ refresh: 'widgets', farm, reason: 'message', alert: 'hi' }, { refresh: 'widgets' }],
  ],
  NotificationAction: [
    ['im_in', 'cant', 'dewdrop'],
    ['maybe', 'reply'],
  ],
  ShareDraft: [
    [draft, { opId, farm, at, files: [], text: 'hello' }],
    [
      { opId, farm, at, files: [] },
      { ...draft, files: [{ ...draft.files[0], path: '/etc/passwd' }] },
      { ...draft, opId: 'not-a-uuid' },
    ],
  ],
};

describeSchemas('native surface contracts', surfaces, samples);

describe('notification actions', () => {
  const plan: PlanPushData = { farm, seq: 31, kind: 'seed_changed', push: 'pu_1', seed: 20 };
  const tend: PushData = { farm, seq: 41, kind: 'message', push: 'pu_2' };

  it('answers a plan from the lock screen', () => {
    expect(surfaces.actionCommand('im_in', 'plan', plan, opId)).toEqual({
      farm,
      command: { opId, kind: 'rsvp', payload: { seed: 20, answer: 'in' } },
    });
    expect(surfaces.actionCommand('cant', 'plan', plan, opId)?.command).toEqual({
      opId,
      kind: 'rsvp',
      payload: { seed: 20, answer: 'out' },
    });
    // A dewdrop can't sit on a planting: on a plan push it goes to the farm.
    expect(surfaces.actionCommand('dewdrop', 'plan', plan, opId)?.command.payload).toEqual({});
  });

  it('leaves a dewdrop on what a tend push was about, and nothing else', () => {
    expect(surfaces.actionCommand('dewdrop', 'tend', tend, opId)?.command.payload).toEqual({
      target: 41,
    });
    expect(surfaces.actionCommand('im_in', 'tend', tend, opId)).toBeNull();
    expect(surfaces.actionCommand('im_in', 'plan', tend, opId)).toBeNull();
    expect(surfaces.actionCommand('dewdrop', 'tend', { ...tend, farm: null }, opId)).toBeNull();
    expect(
      surfaces.actionCommand('dewdrop', 'tend', { ...tend, seq: null }, opId)?.command.payload,
    ).toEqual({});
  });

  it('puts a tend push’s dewdrop on its event only when that is something said in the chat', () => {
    const doorstep: PushData = { farm, seq: 52, kind: 'gift', push: 'pu_3' };
    expect(surfaces.actionCommand('dewdrop', 'tend', doorstep, opId)?.command.payload).toEqual({});
    for (const kind of ['message', 'sticker', 'media', 'voice', 'link', 'quiet_note'] as const) {
      expect(
        surfaces.actionCommand('dewdrop', 'tend', { ...tend, kind }, opId)?.command.payload,
      ).toEqual({ target: 41 });
    }
  });

  it('builds only commands the farm accepts', () => {
    for (const action of surfaces.NotificationAction.options) {
      for (const [category, data] of [
        ['plan', plan],
        ['tend', tend],
      ] as const) {
        const built = surfaces.actionCommand(action, category, data, opId);
        if (built) expect(FarmCommand.safeParse(built.command).success, action).toBe(true);
      }
    }
    expect(surfaces.NOTIFICATION_ACTIONS.plan).toEqual(['im_in', 'cant', 'dewdrop']);
  });
});
