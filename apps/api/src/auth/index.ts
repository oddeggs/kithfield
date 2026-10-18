import type { Bindings } from '../env';
import { checkRtToken, type RtTokenScope } from './rt-token';

export { authRoutes } from './routes';
export { requireSession, errorResponse, type SessionEnv } from './session';
export { isBanned } from './bans';
export { RT_TOKEN_LIFETIME_MS, type RtTokenScope } from './rt-token';

/**
 * The person a socket token speaks for, or null. The farm object passes `{farm}` with its own farm
 * id, the cottage `{cottage}` with its person id; anything forged, expired, for another socket, or
 * checked where the auth secret is unset is null, and the socket answers `error {unauthorized}`.
 */
export function verifyRtToken(
  env: Pick<Bindings, 'BETTER_AUTH_SECRET'>,
  token: unknown,
  scope: RtTokenScope,
  now?: number,
): Promise<string | null> {
  const secret = env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret.length < 32) return Promise.resolve(null);
  return checkRtToken(secret, token, scope, now);
}
