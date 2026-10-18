import type { Bindings } from '../env';
import type { CottageDO } from './cottage-object';

/** The person's cottage. */
export function cottageOf(env: Bindings, person: string): DurableObjectStub<CottageDO> {
  return env.COTTAGE.get(env.COTTAGE.idFromName(person));
}
