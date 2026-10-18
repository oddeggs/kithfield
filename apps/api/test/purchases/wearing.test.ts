import { describe, expect, it } from 'vitest';

import { api, cast } from '../farm/support/doubles';
import { rcEvent, tell } from './support';

describe('wearing what you own', () => {
  it('refuses a cottage, companion or coat from the cart that the person doesn’t own', async () => {
    const { pip } = await cast('pip');
    const wear = (change: Record<string, unknown>) =>
      api(pip, 'PATCH', '/v1/me/profile', { critter: { ...pip.critter, ...change } });
    expect((await wear({ cottage: 'lighthouse' })).status).toBe(403);
    expect((await wear({ companion: 'duckling' })).status).toBe(403);
    expect((await wear({ coat: 'moonlit' })).status).toBe(403);

    await tell(
      rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.item.lighthouse', { expiration_at_ms: null }),
    );
    expect((await wear({ cottage: 'lighthouse' })).status).toBe(200);
  });

  it('lets anyone wear the wardrobe every critter starts with', async () => {
    const { pip } = await cast('pip');
    for (const accessory of ['beanie', 'scarf', 'satchel']) {
      const r = await api(pip, 'PATCH', '/v1/me/profile', {
        critter: { ...pip.critter, accessory },
      });
      expect(r.status).toBe(200);
    }
    expect(
      (await api(pip, 'PATCH', '/v1/me/profile', { critter: { ...pip.critter, coat: 'cocoa' } }))
        .status,
    ).toBe(200);
  });
});
