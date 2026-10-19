import { describe, expect, it } from 'vitest';

import { GRACE_SLACK_MS } from '../../src/purchases/config';
import { stateNow } from '../../src/purchases/entitlements';
import { cast } from '../farm/support/doubles';
import { entitlements, rcEvent, tell } from './support';

describe('billing grace', () => {
  it('keeps the perks while the store retries, and lets them rest once its time is long over', () => {
    const row = {
      product: 'kf.patron.monthly',
      state: 'grace' as const,
      since: 0,
      until: 1_000,
      store: 'app_store',
    };
    expect(stateNow(row, 1_000 + GRACE_SLACK_MS - 1)).toBe('grace');
    expect(stateNow(row, 1_000 + GRACE_SLACK_MS)).toBe('lapsed');
  });

  it('ends a grace whose news of expiry never came', async () => {
    const { pip } = await cast('pip');
    await tell(
      rcEvent(pip.id, 'BILLING_ISSUE', 'kf.patron.monthly', {
        expiration_at_ms: Date.now() - 30 * 86_400_000,
      }),
    );
    const e = await entitlements(pip);
    expect(e.perks).toBe(false);
    expect(e.patronage?.state).toBe('lapsed');
  });
});
