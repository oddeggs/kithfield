import { describe, expect, it, jest } from '@jest/globals';

import { createNetworkSwitch } from './dev-network';
import type { WebSocketLike } from './socket';

const socket = (): WebSocketLike & { closed: boolean } => {
  const s = {
    closed: false,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: () => undefined,
    close: () => {
      s.closed = true;
    },
  };
  return s;
};

describe('the development network switch', () => {
  it('closes open sockets, fails requests and new sockets while offline, then lets them through', async () => {
    const open = socket();
    const fetch = jest.fn(() => Promise.resolve(new Response('ok')));
    const network = createNetworkSwitch({ fetch, openSocket: () => open });
    const changes = jest.fn();
    network.subscribe(changes);

    expect(network.openSocket('ws://x')).toBe(open);
    network.setOffline(true);
    expect(open.closed).toBe(true);
    expect(changes).toHaveBeenCalledTimes(1);
    await expect(network.fetch('http://x')).rejects.toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();

    const dead = network.openSocket('ws://x');
    const closed = new Promise((resolve) => (dead.onclose = resolve));
    await expect(closed).resolves.toEqual({ code: 1006 });

    network.setOffline(false);
    await expect(network.fetch('http://x')).resolves.toBeInstanceOf(Response);
    expect(network.offline()).toBe(false);
  });
});
