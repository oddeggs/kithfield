import type { FarmId, FireActivity } from '@kithfield/contracts';
import { useEffect, useRef } from 'react';

import {
  endFireActivity,
  startFireActivity,
  useAudioRouteNotes,
  useFireActivityButtons,
} from '../surfaces';
import { fireActivityState, type FirePerson } from './room-model';

/*
 * The fire room on the system: the fire's Live Activity while you sit (Mute, Unmute and Leave on
 * it come back here), and notes when the sound moves (an AirPod out pauses your mic, not the
 * room).
 */

/** The Live Activity ends this long after everyone else has gone home. */
export const ALONE_END_MS = 10 * 60 * 1000;

export interface FireSurfacesInput {
  readonly farm: FarmId;
  readonly farmName: string | null;
  /** You are sitting by the fire (in the room, or deciding whether to head home). */
  readonly sitting: boolean;
  readonly people: readonly FirePerson[];
  readonly nameOf: (id: string) => string | null;
  readonly onMic: (on: boolean) => void;
  readonly onLeave: () => void;
}

/** One change at a time, so a quick start and update never make two activities. */
let queue: Promise<void> = Promise.resolve();
const run = (work: () => Promise<void>) => {
  queue = queue.then(work).catch(() => undefined);
};

export function useFireSurfaces(input: FireSurfacesInput): void {
  const { farm, farmName, sitting, people, nameOf } = input;
  const actions = useRef(input);
  actions.current = input;

  const state = sitting ? fireActivityState(people, nameOf) : null;
  const key = state === null ? null : JSON.stringify(state);
  // Ended because you were alone for a while: it waits for your next sitting.
  const endedAlone = useRef(false);
  useEffect(() => {
    if (key === null) {
      endedAlone.current = false;
      run(endFireActivity);
      return;
    }
    if (endedAlone.current) return;
    const now = JSON.parse(key) as FireActivity['state'];
    run(() => startFireActivity({ farm, farmName }, now));
  }, [key, farm, farmName]);

  const alone = sitting && people.every((p) => p.you);
  useEffect(() => {
    if (!alone || endedAlone.current) return;
    const timer = setTimeout(() => {
      endedAlone.current = true;
      run(endFireActivity);
    }, ALONE_END_MS);
    return () => clearTimeout(timer);
  }, [alone]);

  // Leaving the screen ends the sitting, and its activity with it.
  useEffect(
    () => () => {
      run(endFireActivity);
    },
    [],
  );

  useFireActivityButtons((event) => {
    if (event.farm !== farm) return;
    if (event.action === 'leave') actions.current.onLeave();
    else actions.current.onMic(event.action === 'unmute');
  });

  useAudioRouteNotes(() => actions.current.onMic(false));
}
