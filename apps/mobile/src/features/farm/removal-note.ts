import type { Departure } from '@kithfield/contracts';

/*
 * What to say, once, about a farm the Farm tab showed that the person no longer lives on. Never
 * who made the change: a keeper's removal says only that "a keeper" did; the safety team's, or one
 * the phone can't place, names no one.
 */

export type RemovalNote = 'keeper' | 'neutral';

export function removalNote(seen: {
  /** How the person left, as the farm the phone holds says. */
  readonly former: { readonly how: Departure } | null;
  /** Who removed them, from the `removed` event if the phone holds it. */
  readonly by: 'keeper' | 'safety' | null;
  /**
   * The phone still holds them as a member, though the farm turned them away (a 403 or 404) or
   * no longer lists it: the removal never reached the phone.
   */
  readonly stillHeld: boolean;
}): RemovalNote | null {
  if (seen.former?.how === 'removed') return seen.by === 'keeper' ? 'keeper' : 'neutral';
  if (seen.former) return null;
  return seen.stillHeld ? 'neutral' : null;
}
