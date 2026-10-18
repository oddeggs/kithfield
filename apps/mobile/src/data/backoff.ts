export interface BackoffOptions {
  /** The first retry's ceiling. */
  readonly baseMs: number;
  /** No retry waits longer than this. */
  readonly maxMs: number;
}

/** Reconnects start fast and settle at half a minute. */
export const SOCKET_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 30_000 };

/**
 * How long to wait before retry number `attempt` (1 for the first): exponential with full jitter,
 * so a server restart doesn't bring every phone back in the same instant. `random` is in [0, 1).
 */
export function backoffDelay(
  attempt: number,
  options: BackoffOptions,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(options.maxMs, options.baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
