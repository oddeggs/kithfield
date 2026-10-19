import type { AiFeature, ConsentList, ConsentRequest } from '@kithfield/contracts';
import { describe, expect, it } from '@jest/globals';

import {
  AI_FEATURES,
  aiDataCount,
  allowedIn,
  answerConsent,
  CONSENT_TEXT_VERSION,
  isAiFeature,
} from './consent';

const given = (
  feature: AiFeature,
  allowed = true,
  textVersion = CONSENT_TEXT_VERSION,
): ConsentList['consents'][number] => ({ feature, allowed, textVersion, at: 1 });

describe('asking first', () => {
  it('asks for the fire captions, voice-note captions and the recap', () => {
    expect(AI_FEATURES).toEqual(['captions', 'voice_notes', 'recap']);
    expect(['captions', 'voice_notes', 'recap'].every(isAiFeature)).toBe(true);
    expect(isAiFeature('catch_up')).toBe(false);
  });

  it('sends a yes with the words in force, the same version the api counts', async () => {
    const sent: [AiFeature, ConsentRequest][] = [];
    const api = {
      setConsent: (feature: AiFeature, consent: ConsentRequest) => {
        sent.push([feature, consent]);
        return Promise.resolve();
      },
    };
    await answerConsent(api, 'voice_notes', true);
    await answerConsent(api, 'recap', false);
    expect(CONSENT_TEXT_VERSION).toBe('2026-10-19');
    expect(sent).toEqual([
      ['voice_notes', { allowed: true, textVersion: '2026-10-19' }],
      ['recap', { allowed: false, textVersion: '2026-10-19' }],
    ]);
  });

  it('counts a yes only when it was given to the words in force', () => {
    const list = {
      consents: [
        given('captions'),
        given('recap', true, '2026-10-18'),
        given('voice_notes', false),
      ],
    };
    expect(allowedIn(list, 'captions')).toBe(true);
    expect(allowedIn(list, 'recap')).toBe(false);
    expect(allowedIn(list, 'voice_notes')).toBe(false);
    expect(allowedIn(null, 'captions')).toBe(false);
  });

  it('counts what is off across the phone and each feature', () => {
    expect(aiDataCount(false, [])).toEqual({ off: 4, all: 4 });
    expect(aiDataCount(true, [given('captions'), given('voice_notes')])).toEqual({
      off: 1,
      all: 4,
    });
    expect(aiDataCount(false, [given('recap', true, '2026-10-18')])).toEqual({ off: 4, all: 4 });
  });
});
