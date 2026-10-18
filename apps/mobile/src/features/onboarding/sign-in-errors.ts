import { AuthError } from '../../data/session';

/**
 * What a failed email code means to the person: a code that didn't fit (the boxes shake and
 * empty), an address locked out for now (rate limited, or too many wrong codes: try tomorrow or
 * another way in), or a failure of the network or server.
 */
export function codeFailure(error: unknown): 'wrong' | 'lockout' | 'failed' {
  if (!(error instanceof AuthError)) return 'failed';
  const { status, code } = error.failure;
  if (status === 429 || code === 'TOO_MANY_ATTEMPTS') return 'lockout';
  if (status !== undefined && status >= 400 && status < 500) return 'wrong';
  return 'failed';
}

/** Sending a code: an address asked for too often is locked out for now; anything else failed. */
export function sendFailure(error: unknown): 'lockout' | 'failed' {
  return error instanceof AuthError && error.failure.status === 429 ? 'lockout' : 'failed';
}
