import type { Bindings } from '../env';
import { checkRtToken, type RtTokenScope } from './rt-token';

export { authRoutes } from './routes';
export { requireSession, errorResponse, type SessionEnv } from './session';
export { ACCOUNT_BAN_SCOPE, banPerson, isBanned, type Ban } from './bans';
export { eitherBlocked } from './blocks';
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
export { registerProfileFanOut, type ProfileFanOut } from './profile';
export { RT_TOKEN_LIFETIME_MS, type RtTokenScope } from './rt-token';

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
  const live = await env.DB.prepare('SELECT 1 FROM people WHERE id = ? AND deleted_at IS NULL')
    .bind(person)
    .first();
  return live === null ? null : person;
}
