import { afterEach } from 'vitest';

import { answerRoomService, roomServiceCall } from '../src/calls/livekit-double.test-data';

/*
 * The tests never reach the network. Every fetch the Worker makes goes through here: LiveKit's
 * room service (its stand-in host, from the test config) answers as an empty room unless a test
 * stands in for it itself, and a fetch to anywhere else is refused as if offline and fails the
 * test that made it. A test that means to answer another host stands in for `fetch` itself.
 */

const offline = globalThis.fetch;
const reached: string[] = [];

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const call = roomServiceCall(input, init);
  if (call !== null) return Promise.resolve(answerRoomService(call, []));
  const url = urlOf(input);
  const host = URL.canParse(url) ? new URL(url).host : url;
  if (host === 'localhost' || host.startsWith('127.0.0.1')) return offline(input, init);
  reached.push(host);
  return Promise.reject(new TypeError(`network connection lost (tests are offline: ${host})`));
};

afterEach(() => {
  const hosts = [...new Set(reached.splice(0))];
  if (hosts.length > 0) {
    throw new Error(`a test reached for the network: ${hosts.join(', ')}; stand in for it`);
  }
});
