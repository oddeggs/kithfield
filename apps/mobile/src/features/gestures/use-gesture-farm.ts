import type { FarmState } from '@kithfield/contracts';
import { farmView, type FarmView } from '@kithfield/farm';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import {
  useCanWrite,
  useFarm,
  useFarmEvents,
  useOpenFarm,
  type CommandCheck,
  type PendingWrite,
  type StoredEvent,
} from '../../data';
import { useSession } from '../../ui/session/session';
import { friendOf, type Friend } from './model/people';

/** How many of the farm's newest events a gesture screen reads (edits, reactions, warmth). */
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

/**
 * Re-renders exactly when the next of `deadlines` passes (an edit window closing, a slow post
 * arriving), so what a screen offers changes at that moment, not on the next minute.
 */
export function useDeadlines(deadlines: readonly number[]): void {
  const [, setTick] = useState(0);
  const next = Math.min(...deadlines.filter((d) => d > Date.now()));
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const id = setTimeout(() => setTick((n) => n + 1), Math.max(0, next - Date.now()) + 1);
    return () => clearTimeout(id);
  }, [next]);
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
  readonly season: string;
  /** Sleepy, misty, clouds and the rest, as the shared rules compute them now. */
  readonly view: FarmView | null;
  readonly friend: (person: string | null) => Friend | null;
  /**
   * Whether the farm would take a write from you now, by the shared rules (a dry run, nothing is
   * queued). Null until the farm is read.
   */
  readonly can: (write: { kind: string; payload: unknown }) => CommandCheck | null;
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
  const canWrite = useCanWrite(farm);
  const me = person?.id ?? null;
  const view = useMemo(() => (state ? farmView(state, now) : null), [state, now]);
  return {
    farm,
    me,
    state,
    events,
    pending: replica?.pending ?? [],
    pins: state?.pins ?? [],
    now,
    season: state?.season.season ?? 'autumn',
    view,
    friend: (p) => friendOf(state, p),
    can: (write) => (canWrite && me ? canWrite(me, write) : null),
  };
}
