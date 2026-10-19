import type { Critter } from '@kithfield/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SceneCritter } from './fire-scene';
import { sameSeating, seatPeople, type Seating } from './seats';

/*
 * Who the scene draws on which log: seats kept as people come and go, a critter walking up the
 * path for anyone who sits down while you're there, and one waving and walking home for anyone who
 * leaves, which is all anyone ever sees of it.
 */

/** How long someone counts as walking over after they appear (the walk is about two seconds). */
export const ARRIVING_MS = 2100;
/** Who appears this soon after the scene starts showing something was already there. */
const SETTLE_MS = 1500;

export interface CastPerson {
  readonly id: string;
  readonly critter: Critter | null;
  readonly speaking: boolean;
  readonly weak: boolean;
}

interface Departing {
  readonly critter: Critter;
  readonly seat: number;
}

export function useCast(
  people: readonly CastPerson[],
  /**
   * What the scene is showing (null until it knows): whoever is there when it starts showing
   * something new was already sitting; only people who come after walk up the path.
   */
  epoch: string | null,
  /** People who walk in whenever they first appear (you, pulling up a log). */
  walkers: ReadonlySet<string>,
): {
  readonly seating: Seating;
  readonly cast: readonly SceneCritter[];
  readonly arriving: ReadonlySet<string>;
  readonly onGone: (id: string) => void;
} {
  const ids = people.map((p) => p.id);
  const seatsRef = useRef<Seating>({});
  const next = seatPeople(seatsRef.current, ids);
  if (!sameSeating(next, seatsRef.current)) seatsRef.current = next;
  const seating = seatsRef.current;

  // When each person was first seen; those who appear once the scene has settled walk in.
  const firstSeen = useRef(new Map<string, number>());
  const settled = useRef<{ epoch: string | null; at: number }>({ epoch: null, at: 0 });
  const now = Date.now();
  if (epoch !== settled.current.epoch) settled.current = { epoch, at: now };
  const settling = epoch === null || now - settled.current.at < SETTLE_MS;
  for (const id of ids) {
    if (firstSeen.current.has(id)) continue;
    firstSeen.current.set(id, walkers.has(id) || !settling ? now : 0);
  }
  const arriving = new Set(
    ids.filter((id) => {
      const at = firstSeen.current.get(id) ?? 0;
      return at > 0 && now - at < ARRIVING_MS;
    }),
  );
  // One re-render when the newest walk ends, so their chip turns from "joining" to their name.
  const [, setTick] = useState(0);
  const walking = arriving.size > 0;
  useEffect(() => {
    if (!walking) return;
    const timer = setTimeout(() => setTick((n) => n + 1), ARRIVING_MS);
    return () => clearTimeout(timer);
  }, [walking]);

  // Whoever left keeps their log while they wave and walk home.
  const [departing, setDeparting] = useState<ReadonlyMap<string, Departing>>(new Map());
  const lastDrawn = useRef(new Map<string, Departing>());
  const present = new Set(ids);
  const gone = [...lastDrawn.current.keys()].filter((id) => !present.has(id) && !departing.has(id));
  useEffect(() => {
    if (gone.length === 0) return;
    setDeparting((d) => {
      const out = new Map(d);
      for (const id of gone) {
        const was = lastDrawn.current.get(id);
        if (was) out.set(id, was);
      }
      return out;
    });
    // `gone` is derived from the people each render; its contents are what matter.
  }, [gone.join()]);
  for (const p of people) {
    const seat = seating[p.id];
    if (seat !== undefined && p.critter) lastDrawn.current.set(p.id, { critter: p.critter, seat });
  }
  const onGone = useCallback((id: string) => {
    lastDrawn.current.delete(id);
    firstSeen.current.delete(id);
    setDeparting((d) => {
      if (!d.has(id)) return d;
      const out = new Map(d);
      out.delete(id);
      return out;
    });
  }, []);

  const cast: SceneCritter[] = [];
  for (const p of people) {
    const seat = seating[p.id];
    if (seat === undefined || !p.critter) continue;
    cast.push({
      id: p.id,
      critter: p.critter,
      seat,
      moving: arriving.has(p.id) ? 'arriving' : 'seated',
      speaking: p.speaking,
      weak: p.weak,
    });
  }
  for (const [id, d] of departing) {
    if (present.has(id)) continue;
    cast.push({
      id,
      critter: d.critter,
      seat: d.seat,
      moving: 'leaving',
      speaking: false,
      weak: false,
    });
  }
  return { seating, cast, arriving, onGone };
}
