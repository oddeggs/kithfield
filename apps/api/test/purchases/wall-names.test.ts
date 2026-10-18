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
    const wall = await api(pip, 'GET', '/v1/patrons/wall');
    expect((wall.body as { names: string[] }).names).toContain('Juniper & co');
  });
});
