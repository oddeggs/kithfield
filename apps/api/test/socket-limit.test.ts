import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

const upgrade = (path: string, ip: string) =>
  exports.default.fetch(`https://dev.kithfield.com/api${path}`, {
    headers: { Upgrade: 'websocket', 'cf-connecting-ip': ip },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('socket upgrades', () => {
  it('are counted per client address, an IPv6 /64 as one, and refused over the limit', async () => {
    const keys: string[] = [];
    const limit = vi.spyOn(env.SOCKET_LIMIT, 'limit').mockImplementation(({ key }) => {
      keys.push(key);
      return Promise.resolve({ success: false });
    });
    const farm = await upgrade('/v1/farms/somefarm/socket', '2001:db8:1:2:aaaa::1');
    expect(farm.status).toBe(429);
    expect(await farm.json()).toEqual({ error: { code: 'rate_limited' } });
    const cottage = await upgrade('/v1/cottage/someperson/socket', '2001:db8:1:2:bbbb::9');
    expect(cottage.status).toBe(429);
    expect(keys).toEqual(['socket:2001:db8:1:2::/64', 'socket:2001:db8:1:2::/64']);
    expect(limit).toHaveBeenCalledTimes(2);
  });

  it('open while under the limit', async () => {
    const response = await upgrade('/v1/farms/somefarm/socket', '10.9.8.7');
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close();
  });
});
