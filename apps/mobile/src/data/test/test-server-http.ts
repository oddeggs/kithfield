import { EventsQuery, FarmCommand, RtTokenRequest } from '@kithfield/contracts';

import type { FarmTestServer } from './farm-test-server';

/* The test server's HTTP endpoints: rt-token, the command fallback and history paging. */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const error = (status: number, code: string) => json(status, { error: { code } });

export async function handleHttp(
  server: FarmTestServer,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // An answer never arrives without a network, like a real fetch.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (!server.online) throw new TypeError('Network request failed');

  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  const path = url.pathname.replace(/^\/api/, '');
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  const person = /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1];
  if (!person || !server.people.has(person)) return error(401, 'unauthorized');
  if (server.banned.has(person)) return error(403, 'banned');
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

  if (method === 'POST' && path === '/v1/rt-token') {
    const request = RtTokenRequest.parse(body);
    if (request.farm !== undefined && !server.farmOf(request.farm).members.has(person)) {
      return error(403, 'forbidden');
    }
    return json(200, server.issueToken(person, request.farm ?? null));
  }

  const farmPath = /^\/v1\/farms\/([^/]+)\/(cmd|events)$/.exec(path);
  if (!farmPath?.[1]) return error(404, 'not_found');
  const farm = server.farms.get(decodeURIComponent(farmPath[1]));
  if (!farm) return error(404, 'not_found');

  if (method === 'POST' && farmPath[2] === 'cmd') {
    if (!farm.members.has(person)) return error(403, 'forbidden');
    const cmd = FarmCommand.safeParse(body);
    if (!cmd.success) return error(400, 'bad_request');
    server.httpCommands.push(cmd.data.opId);
    return json(200, server.command(farm.farm, person, cmd.data));
  }

  if (method === 'GET' && farmPath[2] === 'events') {
    if (!farm.members.has(person)) return error(403, 'forbidden');
    const query = EventsQuery.parse(Object.fromEntries(url.searchParams));
    const { after, before, limit } = query;
    let page = farm.log.filter(
      (e) =>
        (after === undefined || Number(e['seq']) > after) &&
        (before === undefined || Number(e['seq']) < before),
    );
    let more: boolean;
    if (after !== undefined) {
      more = page.length > limit;
      page = page.slice(0, limit);
    } else {
      more = page.length > limit;
      page = page.slice(-limit);
    }
    return json(200, { events: page, more });
  }

  return error(404, 'not_found');
}
