import type { Critter, FarmState, PersonId } from '@kithfield/contracts';
import { useEffect, useState } from 'react';

import { useDataClient } from '../../data';
import { useValley } from '../farm/valley-store';

export interface Known {
  readonly name: string | null;
  readonly critter: Critter;
}

/** The people on these farms, by id: members first, then those who have left. */
export function peopleOn(states: readonly (FarmState | null)[]): ReadonlyMap<PersonId, Known> {
  const known = new Map<PersonId, Known>();
  for (const state of states) {
    for (const m of state?.members ?? []) {
      if (!known.has(m.person)) known.set(m.person, { name: m.name, critter: m.critter });
    }
  }
  for (const state of states) {
    for (const f of state?.former ?? []) {
      if (!known.has(f.person)) known.set(f.person, { name: f.name, critter: f.critter });
    }
  }
  return known;
}

/**
 * Everyone this person shares a farm with, from the farms this phone holds: how a friend met at
 * another farm's gate is named and drawn.
 */
export function usePeopleKnown(): ReadonlyMap<PersonId, Known> {
  const client = useDataClient();
  const { farms } = useValley();
  const ids = farms.map((f) => f.farm).join(',');
  const [known, setKnown] = useState<ReadonlyMap<PersonId, Known>>(new Map());
  useEffect(() => {
    let live = true;
    const list = ids ? ids.split(',') : [];
    void Promise.all(
      list.map(async (farm) => (await client.replica(farm)).getState().state ?? null),
    ).then(
      (states) => live && setKnown(peopleOn(states)),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, ids]);
  return known;
}
