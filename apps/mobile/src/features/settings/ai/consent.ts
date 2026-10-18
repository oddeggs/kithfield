import type { AiFeature, ConsentList } from '@kithfield/contracts';

import type { SettingsApi } from '../api/settings-api';

/**
 * The version of the consent wording people say yes or no to, stored with each answer. Change it
 * whenever the sheets' text changes, with the api's `AI_CONSENT_TEXT_VERSION`: a yes counts only
 * when it was given to the words in force.
 */
export const CONSENT_TEXT_VERSION = '2026-10-19';

/** The features that send words or voices to the outside AI (`ai.provider`), each asked first. */
export const AI_FEATURES: readonly AiFeature[] = ['captions', 'voice_notes', 'recap'];

export const isAiFeature = (s: unknown): s is AiFeature =>
  s === 'captions' || s === 'voice_notes' || s === 'recap';

/** Whether the person said yes to `feature`, to the words in force: an older yes asks again. */
export const allowedIn = (list: ConsentList | null, feature: AiFeature): boolean =>
  list?.consents.some(
    (c) => c.feature === feature && c.allowed && c.textVersion === CONSENT_TEXT_VERSION,
  ) ?? false;

/** How many AI switches are off, for the Settings row: AI catch-up on the phone and each feature. */
export function aiDataCount(
  catchUpOn: boolean,
  consents: ConsentList['consents'],
): { off: number; all: number } {
  const all = 1 + AI_FEATURES.length;
  const list = { consents };
  const on = (catchUpOn ? 1 : 0) + AI_FEATURES.filter((f) => allowedIn(list, f)).length;
  return { off: all - on, all };
}

/** Records a yes or a no to `feature`, given to the words in force. */
export const answerConsent = (
  api: Pick<SettingsApi, 'setConsent'>,
  feature: AiFeature,
  allowed: boolean,
): Promise<void> => api.setConsent(feature, { allowed, textVersion: CONSENT_TEXT_VERSION });
