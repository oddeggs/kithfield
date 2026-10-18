import { describe, expect, it } from 'vitest';

import { patronageOf } from '../../src/purchases/entitlements';
import { api, cast } from '../farm/support/doubles';
import { entitlements, rcEvent, tell } from './support';

describe('Founding Farmer', () => {
  it('never runs out with time or a subscription ending', async () => {
    const { pip } = await cast('pip');
    await tell(rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.founding', { expiration_at_ms: null }));
    // A patron subscription beside it lapsing changes nothing for the founding perks.
    await tell(rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.monthly'));
    await tell(rcEvent(pip.id, 'EXPIRATION', 'kf.patron.monthly'));
    const e = await entitlements(pip);
    expect(e.perks).toBe(true);
    expect(e.patronage).toMatchObject({ tier: 'founding', state: 'active', until: null });
    const row = {
      product: 'kf.founding',
      state: 'active' as const,
      since: 0,
      until: null,
      store: null,
    };
    expect(patronageOf(row, Date.now() + 50 * 365 * 86_400_000)?.state).toBe('active');
  });

  it('follows its row: an Apple refund lapses it, and what was kept stays', async () => {
    const { pip } = await cast('pip');
    const bought = rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.founding', {
      expiration_at_ms: null,
    });
    await tell(bought);
    expect((await api(pip, 'POST', '/v1/shop/items/houseboat/keep')).status).toBe(200);
    await tell(
      rcEvent(pip.id, 'CANCELLATION', 'kf.founding', {
        cancel_reason: 'CUSTOMER_SUPPORT',
        transaction_id: bought.transaction_id ?? null,
        expiration_at_ms: null,
      }),
    );
    const e = await entitlements(pip);
    expect(e.perks).toBe(false);
    expect(e.patronage).toMatchObject({ tier: 'founding', state: 'lapsed' });
    expect(e.owned).toContain('houseboat');
  });
});
