import {
  type Departure,
  type EpochMs,
  type EventOf,
  type FarmState,
  type FormerMember,
  type MemberState,
  type PersonId,
  isTombstone,
  LIMITS,
} from '@kithfield/contracts';

import { factsOf } from './growth';
import { asUnsent } from './plans';

/* Membership, presence and settings: who lives on the farm and how their critter looks. */

export const memberOf = (state: FarmState, person: PersonId): MemberState | undefined =>
  state.members.find((m) => m.person === person);

export const updateMember = (
  state: FarmState,
  person: PersonId,
  change: (member: MemberState) => Partial<MemberState>,
): FarmState => {
  if (!memberOf(state, person)) return state;
  return {
    ...state,
    members: state.members.map((m) => (m.person === person ? { ...m, ...change(m) } : m)),
  };
};

const isCritter = (value: unknown): value is MemberState['critter'] =>
  typeof value === 'object' && value !== null && 'species' in value;

/**
 * A new member moves in. A tombstoned `joined` (a removed name, or a deleted account) keeps the
 * critter and how they came, and adds a nameless member.
 */
export const applyJoined = (state: FarmState, event: EventOf<'joined'>): FarmState => {
  const { actor: person, at, payload } = event;
  if (memberOf(state, person) || state.members.length >= LIMITS.members) return state;
  const facts = factsOf(event);
  const critter = facts['critter'];
  if (!isCritter(critter)) return state;
  const member: MemberState = {
    person,
    name: isTombstone(payload) ? null : payload.name,
    critter,
    role: facts['via'] === 'created' && state.kind === 'farm' ? 'keeper' : 'critter',
    joinedAt: at,
    // Moving in isn't opening the farm: sleepiness counts from `joinedAt` until they do.
    lastOpenedAt: null,
    lastWokenAt: null,
    lastTendedAt: null,
    hibernating: false,
    pausedUntil: null,
    activeThisSeason: state.plants.some((p) => p.credits.some((c) => c.person === person)),
    birthday: null,
    status: null,
    cloudAt: null,
    battery: 'open',
  };
  return {
    ...state,
    members: [...state.members, member],
    former: state.former.filter((f) => f.person !== person),
  };
};

/**
 * A member leaves, is removed, or deletes their account. Their cottage stays behind as a former
 * member; a deleted account leaves no name. What was waiting for them goes. A deleted account's
 * doorstep gifts go too, and its plans become unsent. A visitor who deleted their account leaves
 * the same way on farms they only visited: nothing of theirs stays on the doorstep.
 */
export const depart = (
  state: FarmState,
  person: PersonId,
  how: Departure,
  at: EpochMs,
): FarmState => {
  const deleted = how === 'account_deleted';
  const member = memberOf(state, person);
  let former: FormerMember[] = state.former;
  if (member) {
    const entry: FormerMember = {
      person,
      name: deleted ? null : member.name,
      critter: member.critter,
      joinedAt: member.joinedAt,
      leftAt: at,
      how,
    };
    former = [...former.filter((f) => f.person !== person), entry].slice(-500);
  } else if (deleted) {
    former = former.map((f) => (f.person === person ? { ...f, name: null } : f));
  }
  const members = state.members.filter((m) => m.person !== person);
  const fallbackHat = members[0]?.person;
  const seeds = state.seeds.map((s) => {
    const seed = deleted && s.planter === person ? asUnsent(s) : s;
    if (seed.hat !== person) return seed;
    const hat = members.some((m) => m.person === seed.planter) ? seed.planter : fallbackHat;
    return hat ? { ...seed, hat } : seed;
  });
  return {
    ...state,
    members,
    former,
    seeds,
    roses: state.roses.filter((r) => r.person !== person),
    doorstep: state.doorstep.filter((d) => d.to !== person && !(deleted && d.from === person)),
  };
};

export const applySettings = (state: FarmState, event: EventOf<'settings_changed'>): FarmState => {
  const p = event.payload;
  switch (p.setting) {
    case 'name':
      return state.kind === 'farm' ? { ...state, name: p.name } : state;
    case 'land':
      return { ...state, land: p.land };
    case 'calendar':
      // The new hemisphere names seasons from the next `season_rolled`; the new time zone moves
      // day boundaries from the next local day (days never step back).
      return { ...state, timeZone: p.timeZone, hemisphere: p.hemisphere };
    case 'place':
      return { ...state, place: p.place };
    case 'birthdays':
      return { ...state, birthdaysBloom: p.on };
    case 'approval':
      return { ...state, approval: p.on };
    case 'theme':
      return { ...state, theme: p.theme };
    case 'role':
      return updateMember(state, p.person, () => ({ role: p.role }));
    case 'frozen':
      return { ...state, frozen: p.on };
    case 'paused':
      return updateMember(state, p.person, () => ({ pausedUntil: p.until }));
  }
};

/**
 * A status bubble, rain cloud or social battery. A tombstoned one keeps which status it was (and
 * the cloud or battery value, never the words), so the bubble it set clears.
 */
export const applyStatus = (state: FarmState, event: EventOf<'status'>): FarmState => {
  const { actor, at, seq, payload: p } = event;
  const facts = factsOf(event);
  switch (facts['status']) {
    case 'words': {
      const text = isTombstone(p) || p.status !== 'words' ? null : p.text;
      return updateMember(state, actor, () => ({ status: text ? { text, at, seq } : null }));
    }
    case 'cloud':
      return updateMember(state, actor, () => ({ cloudAt: facts['raised'] === true ? at : null }));
    case 'battery': {
      const battery = facts['battery'];
      if (battery !== 'open' && battery !== 'resting') return state;
      return updateMember(state, actor, () => ({ battery }));
    }
    default:
      return state;
  }
};

/** An unsend clears the status bubble it targets. */
export const withoutStatus = (state: FarmState, target: number): FarmState =>
  state.members.some((m) => m.status?.seq === target)
    ? {
        ...state,
        members: state.members.map((m) => (m.status?.seq === target ? { ...m, status: null } : m)),
      }
    : state;

/**
 * A change to a member's critter, name or birthday, from them or written by the farm to restore
 * the previous values after a safety removal. A tombstoned one keeps only the critter.
 */
export const applyCritterChanged = (
  state: FarmState,
  event: EventOf<'critter_changed'>,
): FarmState => {
  const p = event.payload;
  if (isTombstone(p)) {
    const critter = p.facts?.critter;
    return critter ? updateMember(state, event.actor, () => ({ critter })) : state;
  }
  return updateMember(state, event.actor, () => ({
    ...(p.critter ? { critter: p.critter } : {}),
    ...(p.name ? { name: p.name } : {}),
    ...(p.birthday !== undefined ? { birthday: p.birthday } : {}),
  }));
};
