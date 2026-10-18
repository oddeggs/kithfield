import type { AiFeature } from '@kithfield/contracts';

/**
 * The version of the consent wording people say yes or no to, stored with each answer. Change it
 * whenever the sheets' text changes, so earlier answers are known to be to older words.
 */
export const CONSENT_TEXT_VERSION = '2026-10-18';

/**
 * The outside AI's name, as the sheets show it. The design leaves it as a placeholder until the
 * provider is chosen; it must match the Privacy Policy and the App Privacy labels before review.
 */
export const AI_PROVIDER = '[AI provider]';

export const AI_FEATURES: readonly AiFeature[] = ['captions', 'recap'];

export const isAiFeature = (s: unknown): s is AiFeature => s === 'captions' || s === 'recap';
