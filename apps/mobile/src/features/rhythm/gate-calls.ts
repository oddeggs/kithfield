import type { GateGesture } from '@kithfield/contracts';
import { getRandomBytes } from 'expo-crypto';

import { createOpIdMaker } from '../../data/op-id';
import { failureOf, gateOps, outcomeOf, type GateOutcome } from './gate-gestures';
import type { RhythmApi } from './rhythm-api';

/** Op ids for gestures at gates, one per farm and gesture until the farm answers it. */
const ops = gateOps(createOpIdMaker(getRandomBytes));

/** Waves, or leaves a firefly, at another farm's gate: written there with you as the visitor. */
export async function atGate(
  api: RhythmApi,
  farm: string,
  gesture: GateGesture,
): Promise<GateOutcome> {
  const key = `${farm}:${gesture.gesture}`;
  let outcome: GateOutcome;
  try {
    outcome = outcomeOf(await api.atGate(farm, ops.idFor(key), gesture));
  } catch (error) {
    outcome = failureOf(error);
  }
  if (outcome.ok || !outcome.unanswered) ops.answered(key);
  return outcome;
}
