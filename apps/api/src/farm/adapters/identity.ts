import { Critter, DisplayName, type FarmId, type PersonId } from '@kithfield/contracts';

import type { Bindings } from '../../env';
import type { Identity, Profile } from '../ports';

/**
 * Who is asking, from auth. Socket tokens and sessions are auth's: until its `verifyRtToken` and
 * session check are wired in here, every token and request is refused rather than trusted.
 */
export const authIdentity: Identity = {
  socketPerson(_env: Bindings, _token: string, _farm: FarmId): Promise<PersonId | null> {
    return Promise.resolve(null);
  },
  requestPerson(_env: Bindings, _request: Request): Promise<PersonId | null> {
    return Promise.resolve(null);
  },
  async profile(env: Bindings, person: PersonId): Promise<Profile | null> {
    const row = await env.DB.prepare(
      'SELECT display_name, critter FROM people WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(person)
      .first<{ display_name: string | null; critter: string | null }>();
    if (row === null || row.display_name === null || row.critter === null) return null;
    const name = DisplayName.safeParse(row.display_name);
    const critter = Critter.safeParse(JSON.parse(row.critter));
    return name.success && critter.success ? { name: name.data, critter: critter.data } : null;
  },
};
