import type { FarmState } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useArt } from '../../ui/art/art-provider';
import { bakeBackdrop, bakeCritter, type Backdrop } from './farm-bake';
import type { CanvasCritter } from './farm-canvas';
import { bakeFarmFire, type FarmFire } from './farm-fire';
import { placeFarm, type FarmPlacement, type HouseKey } from './scene-layout';
import { whenIdle } from './use-now';

export interface FarmScene {
  readonly placement: FarmPlacement;
  /** Null until the still is drawn (on an idle moment after the screen's first frame). */
  readonly backdrop: Backdrop | null;
  readonly critters: readonly CanvasCritter[];
  /** The fire while it is lit (null until it is drawn, on an idle moment). */
  readonly fire: FarmFire | null;
  /** Who is asleep now, by person. */
  readonly asleep: ReadonlySet<string>;
  /** The still and every critter are drawn: the farm can be shown. */
  readonly drawn: boolean;
}

/** Critters drawn per idle moment. */
const BAKE_CHUNK = 4;

/** A critter's breathing phase, from who they are, so it never changes as others come and go. */
export function phaseOf(person: string): number {
  let h = 0;
  for (let i = 0; i < person.length; i++) h = (h * 31 + person.charCodeAt(i)) >>> 0;
  return (h % 1000) / 500;
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
  fireLit = false,
): FarmScene {
  const store = useArt();
  const { width, height } = size;
  const members = useMemo(() => byJoin(state?.members ?? []), [state?.members]);
  const former = useMemo(() => byJoin(state?.former ?? []), [state?.former]);
  const placement = useMemo(
    () =>
      placeFarm(
        members.map((m) => ({
          person: m.person,
          species: m.critter.species,
          joinedAt: m.joinedAt,
        })),
        former.map((f) => ({ person: f.person, species: f.critter.species, joinedAt: f.joinedAt })),
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

  const fireKey = fireLit ? JSON.stringify({ width, height, night }) : null;
  const [fire, setFire] = useState<FarmFire | null>(null);
  useEffect(() => {
    if (!fireKey) {
      setFire(null);
      return;
    }
    const req = JSON.parse(fireKey) as { width: number; height: number; night: boolean };
    return whenIdle(() => setFire(bakeFarmFire(store, req.width, req.height, req.night)));
  }, [store, fireKey]);

  const crittersKey = JSON.stringify(
    placement.critters.map((p) => {
      const m = members.find((x) => x.person === p.person);
      return [p.person, m?.critter, p.spot, asleep.has(p.person)];
    }),
  );
  const [critters, setCritters] = useState<readonly CanvasCritter[]>([]);
  // Drawn critters by what was drawn, so a change re-bakes only the critters it touches.
  const baked = useRef(new Map<string, CanvasCritter>());
  useEffect(() => {
    const wanted = placement.critters.flatMap((p) => {
      const m = members.find((x) => x.person === p.person);
      if (!m) return [];
      const sleeping = asleep.has(p.person);
      return [
        { p, m, sleeping, key: JSON.stringify([p.person, m.critter, p.spot, sleeping, width]) },
      ];
    });
    const showing = new Map(critters.map((c) => [c.person, c]));
    const keys = new Set(wanted.map((w) => w.key));
    for (const k of [...baked.current.keys()]) if (!keys.has(k)) baked.current.delete(k);
    const publish = () =>
      setCritters(
        wanted.flatMap((w) => {
          const c = baked.current.get(w.key) ?? showing.get(w.p.person);
          return c ? [c] : [];
        }),
      );
    // Front-most first, a few at a time on idle moments, so the nearest critters appear first
    // and no single bake holds up a frame.
    const todo = [...wanted]
      .filter((w) => !baked.current.has(w.key))
      .sort((a, b) => b.p.spot.y - a.p.spot.y);
    if (todo.length === 0) {
      publish();
      return;
    }
    let cancel: () => void = () => undefined;
    const step = () => {
      for (const w of todo.splice(0, BAKE_CHUNK)) {
        const size = width * w.p.spot.size;
        baked.current.set(w.key, {
          person: w.p.person,
          x: width * w.p.spot.x,
          y: height * w.p.spot.y,
          size,
          asleep: w.sleeping,
          ph: phaseOf(w.p.person),
          poses: bakeCritter(store, w.m.critter, size, w.p.spot.dir, w.sleeping),
        });
      }
      publish();
      if (todo.length > 0) cancel = whenIdle(step);
    };
    cancel = whenIdle(step);
    return () => cancel();
    // `crittersKey` stands for the placement, the members' critters and who sleeps.
  }, [store, crittersKey, width, height]);

  const standing = placement.critters.filter((p) => members.some((m) => m.person === p.person));
  const drawn =
    backdrop !== null && standing.every((p) => critters.some((c) => c.person === p.person));
  return { placement, backdrop, critters, fire, asleep, drawn };
}
