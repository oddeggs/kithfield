import type { Critter, Me } from '@kithfield/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useDataClient } from '../../../data';
import { useSession } from '../../../ui/session/session';

let held: { person: string; me: Me } | null = null;

/**
 * The signed-in person's name and critter. Read once a session, and again with `refresh` after
 * something may have changed them (the export screen checks before it packs).
 */
export function useMe(): {
  readonly person: string | null;
  readonly name: string | null;
  readonly critter: Critter | null;
  readonly refresh: () => void;
} {
  const { person } = useSession();
  const client = useDataClient();
  const id = person?.id ?? null;
  const [me, setMe] = useState<Me | null>(held && held.person === id ? held.me : null);
  const [ask, setAsk] = useState(0);
  useEffect(() => {
    if (id === null || (ask === 0 && held && held.person === id)) return;
    let live = true;
    client.api.me().then(
      (m) => {
        held = { person: id, me: m };
        if (live) setMe(m);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, id, ask]);
  const refresh = useCallback(() => setAsk((n) => n + 1), []);
  return { person: id, name: me?.name ?? null, critter: me?.critter ?? null, refresh };
}
