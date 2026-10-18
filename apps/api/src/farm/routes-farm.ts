import {
  type CommandResult,
  EventsQuery,
  FarmCommand,
  GateRequest,
  OpId,
  SearchQuery,
  TradeRequest,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { profileOf } from './adapters/identity';
import { roleOf } from './d1';
import { body, fail, farmParam, farmStub, member, sessionOrActionKey, signedIn } from './http';

/* Inside one farm: the socket, commands, history, search, and visitors at the gate. */

export const farmRoutes = (): Hono<SessionEnv> => {
  const app = new Hono<SessionEnv>();

  /** Upgraded and handed to the farm object; the phone says hello (with its token) first. */
  app.get('/farms/:id/socket', async (c) => {
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return fail(c, 400, 'bad_request');
    const farm = farmParam(c);
    if (farm === null) return fail(c, 404, 'not_found');
    return farmStub(c.env, farm).fetch(c.req.raw);
  });

  /** The same write as the socket's `cmd`, with the same once-per-op-id answer. */
  app.post('/farms/:id/cmd', sessionOrActionKey, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const raw: unknown = await c.req.json().catch(() => undefined);
    const parsed = FarmCommand.safeParse(raw);
    const farm = farmStub(c.env, m.farm);
    if (parsed.success) return c.json(await farm.command(m.person, parsed.data));
    const opId = OpId.safeParse((raw as { opId?: unknown } | undefined)?.opId);
    if (!opId.success) return fail(c, 400, 'bad_request', ['opId']);
    return c.json(await farm.rejectInvalid(opId.data));
  });

  app.get('/farms/:id/events', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const query = EventsQuery.safeParse(c.req.query());
    if (!query.success)
      return fail(
        c,
        400,
        'bad_request',
        query.error.issues.map((i) => i.path.join('.')),
      );
    return c.json(await farmStub(c.env, m.farm).page(query.data));
  });

  app.get('/farms/:id/search', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const query = SearchQuery.safeParse(c.req.query());
    if (!query.success) return fail(c, 400, 'bad_request', ['q']);
    return c.json(await farmStub(c.env, m.farm).search(query.data.q));
  });

  /** What a visitor sees at another farm's gate. Never its chat. */
  app.get('/farms/:id/gate', signedIn, async (c) => {
    const farm = farmParam(c);
    const gate = farm === null ? null : await farmStub(c.env, farm).gate();
    return gate === null ? fail(c, 404, 'not_found') : c.json(gate);
  });

  app.post('/farms/:id/gate', signedIn, async (c) => {
    const person = c.get('person');
    const farm = farmParam(c);
    if (farm === null) return fail(c, 404, 'not_found');
    const req = await body(c, GateRequest);
    if (req instanceof Response) return req;
    const profile = await profileOf(c.env, person);
    if (profile === null) return fail(c, 403, 'forbidden');
    return c.json(await farmStub(c.env, farm).atGate(person, profile, req.opId, req.gesture));
  });

  /**
   * A swap while visiting: the visited farm writes `traded` with its member as actor, then the
   * visitor's own farm writes its side. Both use the request's op id, so a retry finishes the pair.
   */
  app.post('/farms/:id/trade', signedIn, async (c) => {
    const person = c.get('person');
    const visited = farmParam(c);
    if (visited === null) return fail(c, 404, 'not_found');
    const req = await body(c, TradeRequest);
    if (req instanceof Response) return req;
    if (req.from === visited) return fail(c, 400, 'bad_request', ['from']);
    if ((await roleOf(c.env.DB, req.from, person)) === null) return fail(c, 403, 'forbidden');
    const rejected = (reason: 'not_found'): CommandResult => ({
      result: 'rejected',
      opId: req.opId,
      reason,
    });
    if ((await roleOf(c.env.DB, visited, req.with)) === null) return c.json(rejected('not_found'));
    const theirs = farmStub(c.env, visited);
    const ours = farmStub(c.env, req.from);
    const take = await theirs.basketCrop(req.take);
    const give = req.give === null ? null : await ours.basketCrop(req.give);
    if (take === null || (req.give !== null && give === null)) return c.json(rejected('not_found'));
    const first = await theirs.recordTrade(req.opId, req.with, {
      with: person,
      otherFarm: req.from,
      gave: take,
      got: give,
    });
    if (first.result === 'rejected') return c.json(first);
    return c.json(
      await ours.recordTrade(req.opId, person, {
        with: req.with,
        otherFarm: visited,
        gave: give,
        got: take,
      }),
    );
  });

  return app;
};
