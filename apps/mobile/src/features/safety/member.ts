import type { Critter, FarmId, FarmState, PersonId } from '@kithfield/contracts';
import { useCallback } from 'react';

import { useFarmSelector } from '../../data';

export interface Someone {
  readonly name: string | null;
  readonly critter: Critter | null;
}

const NOBODY: Someone = { name: null, critter: null };

/** How a person is drawn on a farm: a member, or someone who has since left it. */
export function someoneOn(state: FarmState | null, person: PersonId): Someone {
  const member = state?.members.find((m) => m.person === person);
  if (member) return { name: member.name, critter: member.critter };
  const former = state?.former.find((m) => m.person === person);
  return former ? { name: former.name, critter: former.critter } : NOBODY;
}

const same = (a: Someone, b: Someone) =>
  a.name === b.name && JSON.stringify(a.critter) === JSON.stringify(b.critter);

/** A person as one farm the phone holds knows them. */
export function useSomeone(farm: FarmId, person: PersonId | null): Someone {
  const pick = useCallback(
    (s: { state: FarmState | null } | null) =>
      person === null ? NOBODY : someoneOn(s?.state ?? null, person),
    [person],
  );
  return useFarmSelector(farm, pick, same);
}
