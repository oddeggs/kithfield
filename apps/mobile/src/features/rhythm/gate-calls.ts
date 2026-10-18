import type { GateGesture } from '@kithfield/contracts';
import { getRandomBytes } from 'expo-crypto';

import { createOpIdMaker } from '../../data/op-id';
import { failureOf, outcomeOf, type GateOutcome } from './gate-gestures';
import type { RhythmApi } from './rhythm-api';

const newOpId = createOpIdMaker(getRandomBytes);

/** Waves, or leaves a firefly, at another farm's gate: written there with you as the visitor. */
export async function atGate(
  api: RhythmApi,
  farm: string,
  gesture: GateGesture,
): Promise<GateOutcome> {
  try {
    return outcomeOf(await api.atGate(farm, newOpId(), gesture));
  } catch (error) {
    return failureOf(error);
  }
}
