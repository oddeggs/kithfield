import type { Bindings } from '../env';
import { checkRtToken, rtTokenSession, type RtTokenScope } from './rt-token';

export { authRoutes } from './routes';
export { requireSession, errorResponse, type SessionEnv } from './session';
export { ACCOUNT_BAN_SCOPE, banPerson, isBanned, type Ban } from './bans';
export { blockerCount, blockPerson, eitherBlocked } from './blocks';
export { registerAiForgetStep, type AiForgetStep, type ConsentForgetJob } from './consents';
export { registerSocketCloser, startDeletion, type SocketCloser } from './account-deletion';
export {
  appleRevocation,
  queueDuePurges,
  registerAccountDeletionStep,
  type AccountDeletionStep,
  type AppleRevocation,
} from './purge';
export { registerMergeStep, type MergeStep, type PersonMerge } from './merge-steps';
export { CURRENT_TERMS_VERSION } from './terms';
export {
  registerProfileFanOut,
  registerWardrobeCheck,
  type ProfileFanOut,
  type WardrobeCheck,
} from './profile';
export { RT_TOKEN_LIFETIME_MS, rtTokenSession, type RtTokenScope } from './rt-token';

/**
 * The person a socket token speaks for, or null. The farm object passes `{farm}` with its own farm
 * id, the cottage `{cottage}` with its person id; anything forged, expired, for another socket,
 * checked where the auth secret is unset, or for someone whose account is being deleted is null,
 * and the socket answers `error {unauthorized}`.
 */
export async function verifyRtToken(
  env: Pick<Bindings, 'BETTER_AUTH_SECRET' | 'DB'>,
  token: unknown,
  scope: RtTokenScope,
  now?: number,
): Promise<string | null> {
  const secret = env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret.length < 32) return null;
  const person = await checkRtToken(secret, token, scope, now);
  if (person === null) return null;
  // A token minted under a session that has since ended (signed out from another device) opens
  // nothing more.
  const session = rtTokenSession(token);
  const live = await env.DB.prepare(
    `SELECT 1 FROM people p WHERE p.id = ?1 AND p.deleted_at IS NULL
       AND (?2 IS NULL OR EXISTS (SELECT 1 FROM sessions s WHERE s.id = ?2 AND s.person_id = ?1))`,
  )
    .bind(person, session)
    .first();
  return live === null ? null : person;
}
