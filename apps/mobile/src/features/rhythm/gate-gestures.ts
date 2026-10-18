import type { CommandResult } from '@kithfield/contracts';
import type { StringKey } from '@kithfield/i18n';

import { ApiError } from '../../data/api-client';

/** How a gesture at a friend's gate went: done, or why not in words the screen can show. */
export type GateOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly message: StringKey;
      readonly gone?: true;
      /** The farm never answered (offline, too fast, a timeout): a retry may send it again. */
      readonly unanswered?: true;
    };

/** What a refused gesture says. One gesture per farm per farm day is the gate's rule. */
export function outcomeOf(result: CommandResult): GateOutcome {
  if (result.result === 'ack') return { ok: true };
  if (result.reason === 'limit_reached') return { ok: false, message: 'rhythm.visit.oncePerDay' };
  if (result.reason === 'not_member' || result.reason === 'not_allowed') {
    return { ok: false, message: 'rhythm.visit.gone', gone: true };
  }
  return { ok: false, message: 'rhythm.visit.unavailable' };
}

/** What an HTTP failure says: too many too fast, or a gate that's closed to this person. */
export function failureOf(error: unknown): GateOutcome {
  if (error instanceof ApiError && error.status === 429) {
    return { ok: false, message: 'rhythm.visit.limit', unanswered: true };
  }
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    return { ok: false, message: 'rhythm.visit.gone', gone: true };
  }
  return { ok: false, message: 'rhythm.visit.unavailable', unanswered: true };
}

/**
 * The op id each gesture at a gate carries: the same one on every retry until the farm has
 * answered it (an ack or a final refusal), so a gesture sent twice is written once.
 */
export function gateOps(newOpId: () => string) {
  const ids = new Map<string, string>();
  return {
    idFor(gesture: string): string {
      const known = ids.get(gesture);
      if (known) return known;
      const id = newOpId();
      ids.set(gesture, id);
      return id;
    },
    answered(gesture: string): void {
      ids.delete(gesture);
    },
  };
}
