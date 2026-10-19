import { Entitlements, FarmersWall } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import { api, cast } from '../farm/support/doubles';
import { rcEvent, tell } from './support';

describe('a name on the farmers’ wall', () => {
  it('is short, and never something the safety desk would treat as urgent', async () => {
    const { pip } = await cast('pip');
    await tell(rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.monthly'));
    const put = (name: string) => api(pip, 'PUT', '/v1/me/wall', { name });
    expect((await put('x'.repeat(33))).status).toBe(400);
    expect((await put('   ')).status).toBe(400);
    const threat = await put('I will kill you');
    expect(threat.status).toBe(400);
    expect(threat.body).toMatchObject({ error: { code: 'bad_request', fields: ['name'] } });
    expect((await put('Juniper & co')).status).toBe(204);
    const wall = FarmersWall.parse((await api(pip, 'GET', '/v1/patrons/wall')).body);
    expect(wall.names.map((n) => n.name)).toContain('Juniper & co');
  });

  it('is the person’s own to read back, and its entry keeps its id when renamed', async () => {
    const { fig } = await cast('fig');
    await tell(rcEvent(fig.id, 'INITIAL_PURCHASE', 'kf.patron.monthly'));
    const mine = async () =>
      Entitlements.parse((await api(fig, 'GET', '/v1/me/entitlements')).body).wallName;
    const entryOf = async (name: string) =>
      FarmersWall.parse((await api(fig, 'GET', '/v1/patrons/wall')).body).names.find(
        (n) => n.name === name,
      )?.entry;
    expect(await mine()).toBeNull();
    await api(fig, 'PUT', '/v1/me/wall', { name: 'Fig of the Hollow' });
    expect(await mine()).toBe('Fig of the Hollow');
    const entry = await entryOf('Fig of the Hollow');
    expect(entry).toMatch(/^w\d+$/);
    await api(fig, 'PUT', '/v1/me/wall', { name: 'Fig, always' });
    expect(await entryOf('Fig, always')).toBe(entry);
    await api(fig, 'PUT', '/v1/me/wall', { name: null });
    expect(await mine()).toBeNull();
  });
});
