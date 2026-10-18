import type { CommandResult } from '@kithfield/contracts';
import type { StringKey } from '@kithfield/i18n';

import { ApiError } from '../../data/api-client';

/** How a gesture at a friend's gate went: done, or why not in words the screen can show. */
export type GateOutcome =
  { readonly ok: true } | { readonly ok: false; readonly message: StringKey; readonly gone?: true };

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
    return { ok: false, message: 'rhythm.visit.limit' };
  }
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    return { ok: false, message: 'rhythm.visit.gone', gone: true };
  }
  return { ok: false, message: 'rhythm.visit.unavailable' };
}
