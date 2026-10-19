import type { FarmState, PersonId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';

/** A member's birthday bloom as the screen draws it today. */
export interface BirthdayBloom {
  readonly person: PersonId;
  /** Their name, or null when it's gone (a removed name). */
  readonly name: string | null;
  readonly you: boolean;
  /** Everyone who watered the bloom or signed the card, in the order they did, once each. */
  readonly petals: readonly PersonId[];
  /** Whether you have watered it, and signed the card, today. */
  readonly watered: boolean;
  readonly signed: boolean;
}

/**
 * The bloom over `person`'s cottage, if their rose is open today; null once the day has passed,
 * or if they keep their birthday to themselves (or the farm has birthdays off).
 */
export function birthdayBloom(
  state: FarmState,
  view: FarmView,
  person: PersonId,
  me: PersonId | null,
): BirthdayBloom | null {
  const rose = view.roses.find((r) => r.person === person);
  if (!rose) return null;
  const member = state.members.find((m) => m.person === person);
  const petals = [...new Set([...rose.waterers, ...rose.signers])];
  return {
    person,
    name: member?.name ?? null,
    you: person === me,
    petals,
    watered: me !== null && rose.waterers.includes(me),
    signed: me !== null && rose.signers.includes(me),
  };
}
