import type { CritterLook } from '@kithfield/art';
import type { FarmState, MemberState } from '@kithfield/contracts';
import { CLOUD_MS } from '@kithfield/farm';

import { lookOf } from '../../../ui/art/critter-look';

/** Someone drawn on a gesture screen: their name (null for a nameless member) and critter. */
export interface Friend {
  readonly person: string;
  readonly name: string | null;
  readonly kind: string;
  readonly look: CritterLook;
  readonly member: MemberState | null;
}

export { lookOf };

/** A person as the farm knows them: a member, someone who has gone, or a merged-away id. */
export function friendOf(state: FarmState | null, person: string | null): Friend | null {
  if (state === null || person === null) return null;
  const kept = state.aliases?.[person] ?? person;
  const member = state.members.find((m) => m.person === kept);
  if (member) {
    return {
      person: kept,
      name: member.name,
      kind: member.critter.species,
      look: lookOf(member.critter),
      member,
    };
  }
  const former = state.former.find((m) => m.person === kept);
  return former
    ? {
        person: kept,
        name: former.name,
        kind: former.critter.species,
        look: lookOf(former.critter),
        member: null,
      }
    : null;
}

/** Everyone on the farm but you, in the order they moved in. */
export function friendsOf(state: FarmState | null, me: string | null): Friend[] {
  if (state === null) return [];
  return [...state.members]
    .filter((m) => m.person !== me)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((m) => ({
      person: m.person,
      name: m.name,
      kind: m.critter.species,
      look: lookOf(m.critter),
      member: m,
    }));
}

/**
 * Who a gesture goes to when the screen wasn't told: on a visit, the other person; on a farm,
 * nobody yet (the screen asks).
 */
export function defaultFriend(
  state: FarmState | null,
  me: string | null,
  to: string | undefined,
): string | null {
  if (to) return to;
  if (state?.kind !== 'visit') return null;
  return friendsOf(state, me)[0]?.person ?? null;
}

/** Whether a member's rain cloud is up: raised within the last 48 hours. */
export const cloudUp = (member: MemberState | null, now: number): boolean =>
  member?.cloudAt != null && now - member.cloudAt < CLOUD_MS;
