import type { FarmState } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { useEffect, useMemo, useState } from 'react';

import { useArt } from '../../ui/art/art-provider';
import { bakeBackdrop, bakeCritter, type Backdrop } from './farm-bake';
import type { CanvasCritter } from './farm-canvas';
import { placeFarm, type FarmPlacement, type HouseKey } from './scene-layout';
import { whenIdle } from './use-now';

export interface FarmScene {
  readonly placement: FarmPlacement;
  /** Null until the still is drawn (on an idle moment after the screen's first frame). */
  readonly backdrop: Backdrop | null;
  readonly critters: readonly CanvasCritter[];
  /** Who is asleep now, by person. */
  readonly asleep: ReadonlySet<string>;
}

const byJoin = <T extends { joinedAt: number }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.joinedAt - b.joinedAt);

/**
 * The farm as the canvas draws it, from the farm's state and the rules' view: who stands where,
 * which cottages are lit at night, and the cached drawings (baked when the JS thread is idle).
 */
export function useFarmScene(
  state: FarmState | null,
  view: FarmView | null,
  size: { width: number; height: number },
  night: boolean,
): FarmScene {
  const store = useArt();
  const { width, height } = size;
  const members = useMemo(() => byJoin(state?.members ?? []), [state?.members]);
  const former = useMemo(() => byJoin(state?.former ?? []), [state?.former]);
  const placement = useMemo(
    () =>
      placeFarm(
        members.map((m) => ({ person: m.person, species: m.critter.species })),
        former.map((f) => ({ person: f.person, species: f.critter.species })),
      ),
    [members, former],
  );
  const asleepList = (view?.critters ?? [])
    .filter((c) => c.sleepy)
    .map((c) => c.person)
    .sort()
    .join(',');
  const asleep = useMemo(() => new Set(asleepList ? asleepList.split(',') : []), [asleepList]);

  // At night a cottage's lamp is on while its critter is awake.
  const lit: HouseKey[] = placement.houses
    .filter((h) => !h.former && !asleep.has(h.person))
    .map((h) => h.key);
  const backdropKey = view
    ? JSON.stringify({ width, height, season: view.season.season, night, lit, fog: view.misty })
    : null;
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null);
  useEffect(() => {
    if (!backdropKey) return;
    const req = JSON.parse(backdropKey) as Parameters<typeof bakeBackdrop>[1];
    return whenIdle(() => setBackdrop(bakeBackdrop(store, req)));
  }, [store, backdropKey]);

  const crittersKey = JSON.stringify(
    placement.critters.map((p) => {
      const m = members.find((x) => x.person === p.person);
      return [p.person, m?.critter, p.spot, asleep.has(p.person)];
    }),
  );
  const [critters, setCritters] = useState<readonly CanvasCritter[]>([]);
  useEffect(() => {
    return whenIdle(() => {
      const drawn = placement.critters.flatMap((p, i): CanvasCritter[] => {
        const m = members.find((x) => x.person === p.person);
        if (!m) return [];
        const size = width * p.spot.size;
        const sleeping = asleep.has(p.person);
        return [
          {
            person: p.person,
            x: width * p.spot.x,
            y: height * p.spot.y,
            size,
            asleep: sleeping,
            ph: i * 0.37,
            poses: bakeCritter(store, m.critter, size, p.spot.dir, sleeping),
          },
        ];
      });
      setCritters(drawn);
    });
    // `crittersKey` stands for the placement, the members' critters and who sleeps.
  }, [store, crittersKey, width, height]);

  return { placement, backdrop, critters, asleep };
}
