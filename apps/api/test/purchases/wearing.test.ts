import { describe, expect, it } from 'vitest';

import { api, cast, plantFarm } from '../farm/support/doubles';
import { op } from '../farm/support/client';
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

  it('asks for the shop’s breezy scarf, which is not the scarf every critter starts with', async () => {
    const { pip } = await cast('pip');
    const r = await api(pip, 'PATCH', '/v1/me/profile', {
      critter: { ...pip.critter, accessory: 'breezy_scarf' },
    });
    expect(r.status).toBe(403);
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

  it('refuses the same clothes through a farm write or a join, not only the profile', async () => {
    const { pip, kit } = await cast('pip', 'kit');
    const { farm, stub } = await plantFarm(pip);
    const lighthouse = { ...pip.critter, cottage: 'lighthouse' };
    const changed = await api(pip, 'POST', `/v1/farms/${farm}/cmd`, {
      opId: op(1),
      kind: 'critter_changed',
      payload: { critter: lighthouse },
    });
    expect(changed.body).toMatchObject({ result: 'rejected', reason: 'not_allowed' });
    expect((await stub.state())?.members[0]?.critter.cottage).toBeNull();

    const invite = (await api(pip, 'POST', `/v1/farms/${farm}/invites`, { expiresAt: null }))
      .body as { code: string };
    const join = (critter: unknown) =>
      api(kit, 'POST', `/v1/invites/${invite.code}/join`, { name: 'Kit', critter });
    expect((await join({ ...kit.critter, coat: 'moonlit' })).status).toBe(403);
    expect((await join(kit.critter)).status).toBe(200);
  });
});
