import type { FarmState } from '@kithfield/contracts';
import { farmDay, farmView, type FarmView } from '@kithfield/farm';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import {
  useFarm,
  useFarmEvents,
  useOpenFarm,
  type PendingWrite,
  type StoredEvent,
} from '../../data';
import { useSession } from '../../ui/session/session';
import { friendOf, type Friend } from './model/people';

/** How many of the farm's newest events a gesture screen reads (edits, reactions, knocks today). */
const RECENT = 400;

/** The time, refreshed each minute: edit windows, slow posts and clouds read it. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** A route parameter as one string, or undefined when it's missing or empty. */
export const one = (v: string | string[] | undefined): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === '' ? undefined : s;
};

/** A route parameter as a seq, or undefined. */
export const seqParam = (v: string | string[] | undefined): number | undefined => {
  const n = Number(one(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export interface GestureFarm {
  readonly farm: string;
  readonly me: string | null;
  readonly state: FarmState | null;
  readonly events: readonly StoredEvent[];
  readonly pending: readonly PendingWrite[];
  readonly pins: readonly number[];
  readonly now: number;
  /** The farm's own day now, for one-a-day rules. */
  readonly today: string | null;
  readonly season: string;
  /** Sleepy, misty, clouds and the rest, as the shared rules compute them now. */
  readonly view: FarmView | null;
  readonly friend: (person: string | null) => Friend | null;
}

/**
 * The farm a gesture screen works on, from its `farm` parameter: the farm as the phone holds it
 * (with pending writes drawn in), its newest events and who you are. Keeps the farm's socket open
 * while the screen shows, so what you send goes at once and what friends send arrives.
 */
export function useGestureFarm(): GestureFarm {
  const params = useLocalSearchParams<{ farm?: string }>();
  const farm = one(params.farm) ?? '';
  useOpenFarm(farm);
  const { person } = useSession();
  const replica = useFarm(farm);
  const events = useFarmEvents(farm, RECENT);
  const now = useMinuteClock();
  const state = replica?.state ?? null;
  const view = useMemo(() => (state ? farmView(state, now) : null), [state, now]);
  return {
    farm,
    me: person?.id ?? null,
    state,
    events,
    pending: replica?.pending ?? [],
    pins: state?.pins ?? [],
    now,
    today: state ? farmDay(state, now) : null,
    season: state?.season.season ?? 'autumn',
    view,
    friend: (p) => friendOf(state, p),
  };
}
