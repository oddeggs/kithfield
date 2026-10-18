import {
  type FarmEvent,
  type FarmState,
  isTombstone,
  type MemberState,
} from '@kithfield/contracts';

import { localDate, localYmd, seasonOf } from '../../../src/farm/calendar';
import type { FarmRules, RuleCheck } from '../../../src/farm/ports';

/*
 * A stand-in for the farm rules, for protocol tests only. It keeps just enough state for the
 * object's own decisions (members, roles, calendar, place, fire, basket) and grows nothing. The
 * real reducer lives in `@kithfield/farm`.
 */

const member = (event: FarmEvent & { kind: 'joined' }): MemberState | null => {
  if (event.actor === null || isTombstone(event.payload)) return null;
  return {
    person: event.actor,
    name: event.payload.name,
    critter: event.payload.critter,
    role: event.payload.via === 'created' ? 'keeper' : 'critter',
    joinedAt: event.at,
    lastOpenedAt: null,
    lastTendedAt: null,
    hibernating: false,
    pausedUntil: null,
    activeThisSeason: false,
    birthday: null,
    status: null,
    cloudAt: null,
    battery: 'open',
  };
};

const withMember = (
  state: FarmState,
  person: string | null,
  change: Partial<MemberState>,
): FarmState => ({
  ...state,
  members: state.members.map((m) => (m.person === person ? { ...m, ...change } : m)),
});

const leave = (
  state: FarmState,
  person: string,
  at: number,
  how: 'left' | 'removed' | 'account_deleted',
) => {
  const gone = state.members.find((m) => m.person === person);
  if (gone === undefined) return state;
  return {
    ...state,
    members: state.members.filter((m) => m.person !== person),
    former: [
      ...state.former,
      {
        person,
        name: how === 'account_deleted' ? null : gone.name,
        critter: gone.critter,
        leftAt: at,
        how,
      },
    ],
  };
};

/** Kinds this stand-in counts as tending, so `lastTendedAt` moves. */
const TENDS = new Set([
  'message',
  'dewdrop',
  'sticker',
  'media',
  'voice',
  'link',
  'wave',
  'hug',
  'knock',
]);

const settingsChanged = (s: FarmState, event: FarmEvent & { kind: 'settings_changed' }) => {
  const p = event.payload;
  if (p.setting === 'place') return { ...s, place: p.place };
  if (p.setting === 'frozen') return { ...s, frozen: p.on };
  if (p.setting === 'approval') return { ...s, approval: p.on };
  if (p.setting === 'calendar') return { ...s, timeZone: p.timeZone, hemisphere: p.hemisphere };
  if (p.setting === 'paused') return withMember(s, p.person, { pausedUntil: p.until });
  if (p.setting === 'role') return withMember(s, p.person, { role: p.role });
  return s;
};

const apply = (s: FarmState, event: FarmEvent): FarmState => {
  if (isTombstone(event.payload)) return s;
  if (event.kind === 'joined') {
    const m = member(event);
    return m === null ? s : { ...s, members: [...s.members, m] };
  }
  if (event.kind === 'left' && event.actor !== null) {
    return leave(s, event.actor, event.at, event.payload.how);
  }
  if (event.kind === 'removed') return leave(s, event.payload.person, event.at, 'removed');
  if (event.kind === 'farm_opened') return withMember(s, event.actor, { lastOpenedAt: event.at });
  if (event.kind === 'hibernate') {
    return withMember(s, event.actor, { hibernating: event.payload.on });
  }
  if (event.kind === 'settings_changed') return settingsChanged(s, event);
  if (event.kind === 'fire' && event.payload.state !== 'sat') {
    return { ...s, fireLitAt: event.payload.state === 'lit' ? event.at : null };
  }
  if (event.kind === 'season_rolled') return { ...s, season: event.payload };
  if (event.kind === 'weather') {
    return { ...s, weather: { day: event.payload.day, weather: event.payload.weather } };
  }
  if (event.kind === 'shared_rain') return { ...s, sharedRainDay: event.payload.day };
  if (event.kind === 'harvested') {
    // The stand-in harvests one pumpkin, so trades have something to swap.
    const { season, year } = event.payload;
    return {
      ...s,
      basket: { season: { season, year }, crops: [{ plant: 'pumpkin', variant: null }] },
    };
  }
  if (event.kind === 'rules_changed') return { ...s, rulesVersion: event.payload.to };
  return TENDS.has(event.kind) ? withMember(s, event.actor, { lastTendedAt: event.at }) : s;
};

const KEEPER_ONLY = new Set(['removed', 'settings_changed']);

/** Test rules at a given version. Knocks to someone who doesn't live here are `unavailable`. */
export const testFarmRules = (version = 1): FarmRules => ({
  RULES_VERSION: version,
  createFarm(created) {
    const p = created.payload;
    const day = localYmd(created.at, p.timeZone);
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
      season: seasonOf(day, p.hemisphere),
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
      today: { day: localDate(created.at, p.timeZone), given: [] },
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
  applyEvent: apply,
  checkCommand(state, cmd, actor, now): RuleCheck {
    const me = state.members.find((m) => m.person === actor);
    if (me === undefined) return { ok: false, reason: 'not_member' };
    if (state.frozen) return { ok: false, reason: 'farm_frozen' };
    if (me.pausedUntil !== null && me.pausedUntil > now)
      return { ok: false, reason: 'account_paused' };
    if (KEEPER_ONLY.has(cmd.kind) && me.role !== 'keeper')
      return { ok: false, reason: 'not_allowed' };
    if (cmd.kind === 'knock' && !state.members.some((m) => m.person === cmd.payload.to)) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true };
  },
  farmView: () => ({}),
});
