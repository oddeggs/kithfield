import { describe, expect, it } from '@jest/globals';
import { RejectReason } from '@kithfield/contracts';
import { translator } from '@kithfield/i18n';

import { refusalCopy } from './copy';

describe('a refused write', () => {
  it('has words for every reason the farm can give, in both languages', () => {
    for (const language of ['en', 'vi'] as const) {
      const t = translator(language);
      for (const reason of RejectReason.options) {
        const said = refusalCopy(t, reason);
        expect(said).not.toContain('gestures.reject');
        expect(said.length).toBeGreaterThan(0);
      }
    }
  });
});
