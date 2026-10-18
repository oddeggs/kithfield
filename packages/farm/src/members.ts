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

/** A new member moves in. A tombstoned `joined` has no name or critter to draw, so it adds no one. */
export const applyJoined = (state: FarmState, event: EventOf<'joined'>): FarmState => {
  const { actor: person, at, payload } = event;
  if (isTombstone(payload) || memberOf(state, person)) return state;
  if (state.members.length >= LIMITS.members) return state;
  const member: MemberState = {
    person,
    name: payload.name,
    critter: payload.critter,
    role: payload.via === 'created' && state.kind === 'farm' ? 'keeper' : 'critter',
    joinedAt: at,
    // Moving in isn't opening the farm: sleepiness counts from `joinedAt` until they do.
    lastOpenedAt: null,
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
 * member; a deleted account leaves no name. What was waiting for them goes, and so does what a
 * deleted account left on doorsteps and the plans it planted.
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
    const entry = {
      person,
      name: deleted ? null : member.name,
      critter: member.critter,
      leftAt: at,
      how,
    };
    former = [...former.filter((f) => f.person !== person), entry].slice(-500);
  } else if (deleted) {
    former = former.map((f) => (f.person === person ? { ...f, name: null } : f));
  }
  const members = state.members.filter((m) => m.person !== person);
  const fallbackHat = members[0]?.person;
  const seeds = state.seeds
    .filter((s) => !(deleted && s.planter === person))
    .map((s) => {
      if (s.hat !== person) return s;
      const hat = members.some((m) => m.person === s.planter) ? s.planter : fallbackHat;
      return hat ? { ...s, hat } : s;
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

export const applyStatus = (state: FarmState, event: EventOf<'status'>): FarmState => {
  const { actor, at, payload: p } = event;
  if (isTombstone(p)) return state;
  switch (p.status) {
    case 'words':
      return updateMember(state, actor, () => ({ status: p.text ? { text: p.text, at } : null }));
    case 'cloud':
      return updateMember(state, actor, () => ({ cloudAt: p.raised ? at : null }));
    case 'battery':
      return updateMember(state, actor, () => ({ battery: p.battery }));
  }
};

export const applyCritterChanged = (
  state: FarmState,
  event: EventOf<'critter_changed'>,
): FarmState => {
  const p = event.payload;
  if (isTombstone(p)) return state;
  return updateMember(state, event.actor, () => ({
    ...(p.critter ? { critter: p.critter } : {}),
    ...(p.name ? { name: p.name } : {}),
    ...(p.birthday !== undefined ? { birthday: p.birthday } : {}),
  }));
};
