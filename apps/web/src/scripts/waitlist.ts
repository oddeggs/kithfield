// Types only: the server checks the bodies against the contracts' schemas, and zod stays out of
// the page's script.
import type { DeletionRequest, Lang, WaitlistRequest } from '@kithfield/contracts';

/** How a request to the site's own API went, as the forms tell it. */
export type JoinOutcome = 'listed' | 'invalid' | 'busy' | 'unreachable';

const TIMEOUT_MS = 10_000;

/** Posts a contract body to `/api…`; never throws. */
async function post(path: string, body: unknown): Promise<JoinOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return 'unreachable';
  }
  if (response.ok) return 'listed';
  if (response.status === 400) return 'invalid';
  if (response.status === 429) return 'busy';
  return 'unreachable';
}

/** Saves a spot on the launch list (`POST /v1/waitlist`); a letter to confirm follows. */
export function joinWaitlist(email: string, lang: Lang): Promise<JoinOutcome> {
  const body: WaitlistRequest = { email: email.trim(), lang };
  return post('/v1/waitlist', body);
}

/** Asks for an account to be deleted (`POST /v1/deletion-requests`); a code to confirm follows. */
export function requestDeletion(email: string, lang: Lang): Promise<JoinOutcome> {
  const body: DeletionRequest = { email: email.trim(), lang };
  return post('/v1/deletion-requests', body);
}

export type ConfirmOutcome = 'confirmed' | 'expired' | 'error';

/** Confirms a waitlist address with the token from the letter (`POST /v1/waitlist/confirm`). */
export async function confirmWaitlist(token: string): Promise<ConfirmOutcome> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return 'expired';
  let response: Response;
  try {
    response = await fetch('/api/v1/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return 'error';
  }
  if (response.ok) return 'confirmed';
  if (response.status === 400 || response.status === 404 || response.status === 410) {
    return 'expired';
  }
  return 'error';
}
