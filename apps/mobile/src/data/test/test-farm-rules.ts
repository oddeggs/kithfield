import type { CareFamily, FarmEvent, FarmState, MemberState } from '@kithfield/contracts';

import type { FarmRules } from '../farm-rules';

/*
 * A minimal stand-in for the shared reducer, for the sync tests only, until the real one in
 * `@kithfield/farm` lands. It keeps members, who last opened and tended, each family's latest
 * tend, pins and the frozen flag: enough to see writes drawn at once and reconciled, and to see
 * a refused write. It grows no plants.
 */

const FAMILY: Partial<Record<FarmEvent['kind'], CareFamily>> = {
  message: 'words',
  link: 'words',
  quiet_note: 'words',
  dewdrop: 'dew',
  sticker: 'pictures',
  media: 'pictures',
  voice: 'voices',
  wave: 'gestures',
  hug: 'gestures',
};

export interface TestFarmView {
  readonly sleepy: readonly string[];
}

const DAY = 86_400_000;

const member = (event: FarmEvent & { kind: 'joined' }, first: boolean): MemberState => ({
  person: event.actor,
  // A tombstoned join adds a nameless member with the critter its facts kept.
  name: 'tombstone' in event.payload ? null : event.payload.name,
  critter:
    'tombstone' in event.payload
      ? (event.payload.facts?.critter ?? {
          species: 'mouse',
          coat: 'grey',
          mark: null,
          accessory: null,
          outfit: null,
          outfitColor: null,
          companion: null,
          cottage: null,
        })
      : event.payload.critter,
  role: first ? 'keeper' : 'critter',
  joinedAt: event.at,
  lastOpenedAt: null,
  lastWokenAt: null,
  lastTendedAt: null,
  hibernating: false,
  pausedUntil: null,
  activeThisSeason: false,
  birthday: null,
  status: null,
  cloudAt: null,
  battery: 'open',
});

const touch = (state: FarmState, person: string | null, change: Partial<MemberState>) => ({
  ...state,
  members: state.members.map((m) => (m.person === person ? { ...m, ...change } : m)),
});

export const testFarmRules: FarmRules<TestFarmView> = {
  RULES_VERSION: 2,

  createFarm(created) {
    const p = created.payload;
    return {
      farm: p.farm,
      kind: p.kind,
      name: p.name,
      land: p.land,
      theme: null,
      timeZone: p.timeZone,
      hemisphere: p.hemisphere,
      place: null,
      birthdaysBloom: true,
      approval: false,
      frozen: false,
      rulesVersion: created.rulesVersion,
      season: { season: 'autumn', year: 2026 },
      weather: null,
      sharedRainDay: null,
      members: [],
      former: [],
      plants: [],
      signature: null,
      familyTendedAt: {
        dew: null,
        words: null,
        pictures: null,
        voices: null,
        gestures: null,
        gatherings: null,
      },
      today: { day: '2026-10-18', given: [] },
      roses: [],
      pot: null,
      fieldGuide: [],
      basket: null,
      seeds: [],
      pins: [],
      doorstep: [],
      fireLitAt: null,
    };
  },

  applyEvent(state, event) {
    if (event.kind === 'joined') {
      return { ...state, members: [...state.members, member(event, state.members.length === 0)] };
    }
    if (event.kind === 'farm_opened') return touch(state, event.actor, { lastOpenedAt: event.at });
    if (event.kind === 'settings_changed' && event.payload.setting === 'frozen') {
      return { ...state, frozen: event.payload.on };
    }
    if (event.kind === 'pin' && !('tombstone' in event.payload)) {
      const { target, on } = event.payload;
      return {
        ...state,
        pins: on ? [...state.pins, target] : state.pins.filter((s) => s !== target),
      };
    }
    const family = FAMILY[event.kind];
    if (!family) return state;
    return {
      ...touch(state, event.actor, { lastTendedAt: event.at, activeThisSeason: true }),
      familyTendedAt: { ...state.familyTendedAt, [family]: event.at },
    };
  },

  applyRestored(state, restored) {
    return restored.kind === 'pin' ? testFarmRules.applyEvent(state, restored) : state;
  },

  checkCommand(state, _cmd, actor) {
    if (state.frozen) return 'farm_frozen';
    if (!state.members.some((m) => m.person === actor)) return 'not_member';
    return null;
  },

  farmView(state, now) {
    return {
      sleepy: state.members
        .filter((m) => now - Math.max(m.lastOpenedAt ?? 0, m.lastWokenAt ?? 0) > 4 * DAY)
        .map((m) => m.person),
    };
  },
};
