import type { Critter, Me } from '@kithfield/contracts';
import { useEffect, useState } from 'react';

import { useDataClient } from '../../../data';
import { useSession } from '../../../ui/session/session';

let held: { person: string; me: Me } | null = null;

/** The signed-in person's name and critter, read once and kept for the session. */
export function useMe(): {
  readonly person: string | null;
  readonly name: string | null;
  readonly critter: Critter | null;
} {
  const { person } = useSession();
  const client = useDataClient();
  const id = person?.id ?? null;
  const [me, setMe] = useState<Me | null>(held && held.person === id ? held.me : null);
  useEffect(() => {
    if (id === null || (held && held.person === id)) return;
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
  }, [client, id]);
  return { person: id, name: me?.name ?? null, critter: me?.critter ?? null };
}
