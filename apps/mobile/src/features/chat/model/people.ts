import type { Critter, FarmState, MemberState, PersonId } from '@kithfield/contracts';

/** A person as the chat draws them: a name (null for a deleted account) and their critter. */
export interface Person {
  readonly person: PersonId;
  readonly name: string | null;
  readonly critter: Critter | null;
  /** Still lives on the farm. */
  readonly member: boolean;
}

export { castOf, lookOf } from '../../../ui/art/critter-look';

/** The person a merged-away id now is. */
export function keptId(state: FarmState | null, person: PersonId): PersonId {
  return state?.aliases[person] ?? person;
}

/** Everyone the chat may need to draw: members first, then former members. */
export function peopleOf(state: FarmState | null): ReadonlyMap<PersonId, Person> {
  const people = new Map<PersonId, Person>();
  if (!state) return people;
  for (const f of state.former) {
    people.set(f.person, { person: f.person, name: f.name, critter: f.critter, member: false });
  }
  for (const m of state.members) {
    people.set(m.person, { person: m.person, name: m.name, critter: m.critter, member: true });
  }
  return people;
}

/** Looks a person up through the farm's aliases. */
export function personIn(
  people: ReadonlyMap<PersonId, Person>,
  state: FarmState | null,
  person: PersonId | null,
): Person | null {
  if (person === null) return null;
  return people.get(keptId(state, person)) ?? null;
}

/** The other person on a visit, or null on a farm. */
export function visitPeer(state: FarmState | null, me: PersonId | null): MemberState | null {
  if (!state || state.kind !== 'visit') return null;
  return state.members.find((m) => m.person !== me) ?? null;
}

/** Whose porch a visit sits on: the person who opened it, the visit's keeper. */
export function porchOwner(state: FarmState | null): MemberState | null {
  if (!state || state.kind !== 'visit') return null;
  return state.members.find((m) => m.role === 'keeper') ?? state.members[0] ?? null;
}
