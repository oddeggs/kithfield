import { Critter, DisplayName, type FarmId, type PersonId } from '@kithfield/contracts';

import { verifyRtToken } from '../../auth';
import type { Bindings } from '../../env';

/** A person's name and critter, as drawn in `joined` and at the gate. */
export type Profile = { name: string; critter: Critter };

/** The person a farm socket token was minted for, for this farm; null when it isn't valid. */
export const socketPerson = (
  env: Bindings,
  token: string,
  farm: FarmId,
): Promise<PersonId | null> => verifyRtToken(env, token, { farm });

/**
 * A person's display name and critter from `people`, as chosen in onboarding; null for an unknown
 * or deleted person, or one who hasn't chosen yet.
 */
export const profileOf = async (env: Bindings, person: PersonId): Promise<Profile | null> => {
  const row = await env.DB.prepare(
    'SELECT display_name, critter FROM people WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(person)
    .first<{ display_name: string | null; critter: string | null }>();
  if (row === null || row.display_name === null || row.critter === null) return null;
  const name = DisplayName.safeParse(row.display_name);
  const critter = Critter.safeParse(JSON.parse(row.critter));
  return name.success && critter.success ? { name: name.data, critter: critter.data } : null;
};
