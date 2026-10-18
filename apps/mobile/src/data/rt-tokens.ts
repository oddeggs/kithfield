import type { FarmId, RtTokenResponse } from '@kithfield/contracts';

/** Tokens are refreshed this long before they expire, so a hello never carries a dying one. */
const REFRESH_AHEAD_MS = 30_000;

/**
 * Socket tokens from `POST /v1/rt-token`, one per farm and one for the cottage, cached until just
 * before they expire. A socket answered `unauthorized` drops its token and asks for a new one.
 */
export function createRtTokens(
  fetchToken: (farm?: FarmId) => Promise<RtTokenResponse>,
  now: () => number = Date.now,
) {
  const cache = new Map<string, RtTokenResponse>();
  const keyOf = (farm?: FarmId) => (farm === undefined ? '' : `farm:${farm}`);

  return {
    async get(farm?: FarmId): Promise<string> {
      const cached = cache.get(keyOf(farm));
      if (cached && cached.expiresAt - REFRESH_AHEAD_MS > now()) return cached.token;
      const fresh = await fetchToken(farm);
      cache.set(keyOf(farm), fresh);
      return fresh.token;
    },
    invalidate(farm?: FarmId): void {
      cache.delete(keyOf(farm));
    },
    clear(): void {
      cache.clear();
    },
  };
}

export type RtTokens = ReturnType<typeof createRtTokens>;
