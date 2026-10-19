import { describe, expect, it } from 'vitest';

import { api, cast } from '../farm/support/doubles';

describe('the shop’s writes, per person', () => {
  it('slows down someone asking for purchase syncs over and over', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await api(pip, 'POST', '/v1/purchases/sync')).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses.at(-1)).toBe(429);
    // Someone else isn't held back.
    expect((await api(fig, 'POST', '/v1/purchases/sync')).status).toBe(200);
  });
});
