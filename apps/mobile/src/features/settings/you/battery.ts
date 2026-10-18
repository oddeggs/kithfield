import type { FarmId, PersonId } from '@kithfield/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useDataClient } from '../../../data';
import { failure } from '../../../data/apply-events';

export type Battery = 'open' | 'resting';

/**
 * The person's social battery. It lives on each farm as a `status` the person writes (friends see
 * it), so it is read from the first farm the phone holds and written to every farm and visit.
 */
export function useBattery(
  farms: readonly FarmId[],
  me: PersonId | null,
): readonly [Battery, (next: Battery) => void] {
  const client = useDataClient();
  const [battery, setBattery] = useState<Battery>('open');
  const first = farms[0] ?? null;
  useEffect(() => {
    if (first === null || me === null) return;
    let live = true;
    client.replica(first).then(
      (replica) => {
        const mine = replica.getState().state?.members.find((m) => m.person === me);
        if (live && mine) setBattery(mine.battery);
      },
      (error: unknown) => client.report(failure('settings.battery', error)),
    );
    return () => {
      live = false;
    };
  }, [client, first, me]);
  const choose = useCallback(
    (next: Battery) => {
      setBattery(next);
      for (const farm of farms) {
        client
          .send(farm, 'status', { status: 'battery', battery: next })
          .catch((error: unknown) => client.report(failure('settings.battery', error)));
      }
    },
    [client, farms],
  );
  return [battery, choose];
}
