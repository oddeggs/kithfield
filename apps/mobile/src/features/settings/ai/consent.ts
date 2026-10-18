import type { AiFeature, ConsentList } from '@kithfield/contracts';
import Constants from 'expo-constants';

/**
 * The version of the consent wording people say yes or no to, stored with each answer. Change it
 * whenever the sheets' text changes, so earlier answers are known to be to older words.
 */
export const CONSENT_TEXT_VERSION = '2026-10-18';

/** The provider named in the app's config (`extra.aiProvider`), or null when none is. */
export function providerFrom(extra: unknown): string | null {
  const named = (extra as { aiProvider?: unknown } | null | undefined)?.aiProvider;
  return typeof named === 'string' && named.trim() !== '' ? named.trim() : null;
}

/**
 * The outside AI's name, as the sheets show it. Until a provider is chosen (and matched in the
 * Privacy Policy and the App Privacy labels) it is null: nothing asks to send anything out.
 */
export const AI_PROVIDER: string | null = providerFrom(Constants.expoConfig?.extra);

export const AI_FEATURES: readonly AiFeature[] = ['captions', 'recap'];

export const isAiFeature = (s: unknown): s is AiFeature => s === 'captions' || s === 'recap';

/**
 * How many AI switches are off, for the Settings row: AI catch-up on the phone and each outside
 * feature. Null while there is no provider, so the row shows no count.
 */
export function aiDataCount(
  provider: string | null,
  catchUpOn: boolean,
  consents: ConsentList['consents'],
): { off: number; all: number } | null {
  if (provider === null) return null;
  const all = 1 + AI_FEATURES.length;
  const on = (catchUpOn ? 1 : 0) + consents.filter((c) => c.allowed).length;
  return { off: all - on, all };
}
