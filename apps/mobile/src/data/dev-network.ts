import type { OpenSocket, WebSocketLike } from './socket';

/*
 * A switch that cuts the data layer's network the way losing signal does: open sockets close,
 * new ones fail, and requests fail as a dropped connection fails. Development builds only, for
 * trying the outbox and catch-up on a simulator, whose network is the Mac's and can't be turned
 * off for one app.
 */

export interface NetworkSwitch {
  /** The data layer's `fetch`: fails at once while offline. */
  readonly fetch: typeof fetch;
  /** The data layer's sockets: unreachable while offline. */
  readonly openSocket: OpenSocket;
  readonly offline: () => boolean;
  setOffline(offline: boolean): void;
  subscribe(listener: () => void): () => void;
}

/** Sockets kept to close when the network goes: enough for the cottage's and a farm's, and spares. */
const TRACKED_SOCKETS = 8;

/** A socket to a host that can't be reached: it fails on the next tick, as React Native's does. */
export function unreachableSocket(): WebSocketLike {
  const socket: WebSocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: () => {
      throw new Error('INVALID_STATE_ERR');
    },
    close: () => undefined,
  };
  setTimeout(() => {
    socket.onerror?.({});
    socket.onclose?.({ code: 1006 });
  }, 0);
  return socket;
}

export function createNetworkSwitch(base: {
  readonly fetch: typeof fetch;
  readonly openSocket: OpenSocket;
}): NetworkSwitch {
  let offline = false;
  const sockets: WebSocketLike[] = [];
  const listeners = new Set<() => void>();
  return {
    fetch: (input, init) =>
      offline ? Promise.reject(new TypeError('Network request failed')) : base.fetch(input, init),
    openSocket: (url) => {
      if (offline) return unreachableSocket();
      const socket = base.openSocket(url);
      sockets.push(socket);
      if (sockets.length > TRACKED_SOCKETS) sockets.shift();
      return socket;
    },
    offline: () => offline,
    setOffline(next) {
      if (next === offline) return;
      offline = next;
      if (offline) for (const socket of sockets.splice(0)) socket.close();
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
