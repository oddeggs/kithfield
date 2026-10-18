import type { JoinRequest, Me } from '@kithfield/contracts';

import { ApiError } from '../../data/api-client';
import type { AcceptResult } from './invite-landing';

export interface JoinAsMemberDeps {
  /** `GET /v1/me`. */
  readonly me: () => Promise<Me>;
  /** `POST /v1/invites/:code/join`. */
  readonly join: (code: string, join: JoinRequest) => Promise<unknown>;
}

/**
 * Someone already on Kithfield moving into another farm from an invite: they bring the name and
 * critter they already have. A farm that filled up, or an invite taken back, is said plainly.
 */
export async function joinAsMember(code: string, deps: JoinAsMemberDeps): Promise<AcceptResult> {
  const person = await deps.me();
  if (person.name === null || person.critter === null) return 'failed';
  try {
    await deps.join(code, { name: person.name, critter: person.critter });
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError && error.code === 'farm_full') return 'full';
    if (error instanceof ApiError && error.code === 'invite_invalid') return 'gone';
    return 'failed';
  }
}
