import type { FarmId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useDataClient, useFarm } from '../../data';
import { momentFor, visitBefore } from './moments';
import { farmRoutes } from './routes';
import { useFarmFlags } from './valley-store';

/**
 * The welcome-back and move-in moments, decided as the farm opens and again when someone new
 * moves in while it is open. Each shows once (see `moments.ts`).
 */
export function useOpenMoments(farm: FarmId, me: string | null) {
  const client = useDataClient();
  const held = useFarm(farm);
  const state = held?.state ?? null;
  const flags = useFarmFlags(farm);
  const latestJoin = state?.members.reduce((a, m) => Math.max(a, m.joinedAt), 0) ?? null;
  const handled = useRef<number | null>(null);
  const openedAt = useRef(Date.now());
  const heldRef = useRef(held);
  heldRef.current = held;
  // A decision in flight belongs to this farm and person: only leaving them drops it, never a
  // redraw of the farm while the phone reads its flags or the server's log.
  const scope = useRef<object | null>(null);
  useEffect(() => {
    const token = {};
    scope.current = token;
    handled.current = null;
    return () => {
      if (scope.current === token) scope.current = null;
    };
  }, [farm, me]);
  useEffect(() => {
    const current = heldRef.current;
    const token = scope.current;
    if (!current?.state || !me || latestJoin === null || handled.current === latestJoin) return;
    if (token === null) return;
    const first = handled.current === null;
    handled.current = latestJoin;
    const farmState = current.state;
    const live = () => scope.current === token;
    void (async () => {
      const [welcomed, joins] = await Promise.all([
        flags.read('welcomed'),
        flags.read('joinsSeen'),
      ]);
      // A farm first read from the server (a fresh install) already counts this visit as the
      // last one: the visit before it is looked up in the log instead.
      const self = farmState.members.find((m) => m.person === me);
      const thisVisit = openedAt.current - 60_000;
      let lastVisit: number | null | undefined;
      if (first && self?.lastOpenedAt != null && self.lastOpenedAt >= thisVisit) {
        // The log's newest page, if the server answers soon; what the phone holds otherwise.
        await Promise.race([
          client.pageHistory(farm, current.lastSeq + 1, 200).catch(() => false),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        lastVisit = visitBefore(await client.events(farm, { limit: 200 }), me, thisVisit);
      }
      if (!live()) return;
      const moment = momentFor(farmState, me, Date.now(), {
        welcomed: welcomed === null ? null : Number(welcomed),
        joinsSeen: joins === null ? null : Number(joins),
        ...(lastVisit === undefined ? {} : { lastVisit }),
      });
      if (moment.kind === 'welcome') {
        await flags.write('welcomed', String(moment.since));
        router.push(farmRoutes.welcome(farm));
        return;
      }
      if (moment.upTo !== null) await flags.write('joinsSeen', String(moment.upTo));
      if (moment.kind === 'moveIn') router.push(farmRoutes.moveIn(farm, moment.person));
    })();
  }, [client, farm, me, latestJoin, flags]);
}
