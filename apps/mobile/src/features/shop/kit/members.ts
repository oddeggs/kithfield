import type { FarmId, FarmState, MemberState, PersonId } from '@kithfield/contracts';
import { isBirthday, localDay } from '@kithfield/farm';

import { useFarm } from '../../../data/react';

/** The farm's state as this phone holds it, or null before it has arrived. */
export function useFarmState(farm: FarmId): FarmState | null {
  return useFarm(farm)?.state ?? null;
}

/** A member of the farm by person id. */
export function memberOf(state: FarmState | null, person: PersonId): MemberState | null {
  return state?.members.find((m) => m.person === person) ?? null;
}

/** Whether it's this member's birthday on the farm's own day. */
export function birthdayToday(state: FarmState | null, person: PersonId, now: number): boolean {
  const birthday = memberOf(state, person)?.birthday;
  if (!state || !birthday) return false;
  try {
    return isBirthday(birthday, localDay(now, state.timeZone));
  } catch {
    return false;
  }
}

/** Whether the person keeps this farm. */
export function isKeeper(state: FarmState | null, person: PersonId): boolean {
  return memberOf(state, person)?.role === 'keeper';
}
