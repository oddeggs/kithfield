import {
  type CommandKind,
  type CommandResult,
  EventsQuery,
  FarmCommand,
  GateRequest,
  OpId,
  type PersonId,
  type RejectReason,
  SearchQuery,
  TradeRequest,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { ACTION_KEY_HEADER } from '../cottage/action-key';
import type { Bindings } from '../env';
import { profileOf } from './adapters/identity';
import { isBlocked } from './blocks';
import { knowsSomeoneOn, noteVisitor, roleOf } from './d1';
import {
  body,
  type Ctx,
  fail,
  farmParam,
  farmStub,
  member,
  sessionOrActionKey,
  signedIn,
} from './http';

/* Inside one farm: the socket, commands, history, search, and visitors at the gate. */

/** What a share extension or a notification reply may send with a device's action key. */
const ACTION_KEY_KINDS: ReadonlySet<CommandKind> = new Set([
  'message',
  'link',
  'media',
  'sticker',
  'voice',
  'reaction',
  'dewdrop',
]);

/**
 * Whether `visitor` may come to `farm`'s gate: they don't live there, and they live on another
 * farm with at least one of its members. The farm itself refuses people it removed.
 */
const mayVisit = async (env: Bindings, visitor: PersonId, farm: string): Promise<boolean> =>
  (await roleOf(env.DB, farm, visitor)) === null && (await knowsSomeoneOn(env.DB, visitor, farm));

/** Gate writes are limited per visitor; false (answer 429) once they're over. */
const withinGateLimit = async (c: Ctx, person: PersonId) =>
  (await c.env.GATE_LIMIT.limit({ key: person })).success;

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
    if (parsed.success) {
      const byKey = c.req.header(ACTION_KEY_HEADER) !== undefined;
      if (byKey && !ACTION_KEY_KINDS.has(parsed.data.kind)) return fail(c, 403, 'forbidden');
      return c.json(await farm.command(m.person, parsed.data));
    }
    const opId = OpId.safeParse((raw as { opId?: unknown } | undefined)?.opId);
    if (!opId.success) return fail(c, 400, 'bad_request', ['opId']);
    return c.json(await farm.rejectInvalid(opId.data));
  });

  app.get('/farms/:id/events', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const query = EventsQuery.safeParse(c.req.query());
    if (!query.success) {
      return fail(
        c,
        400,
        'bad_request',
        query.error.issues.map((i) => i.path.join('.')),
      );
    }
    const page = await farmStub(c.env, m.farm).page(m.person, query.data);
    return page === null ? fail(c, 404, 'not_found') : c.json(page);
  });

  app.get('/farms/:id/search', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const query = SearchQuery.safeParse(c.req.query());
    if (!query.success) return fail(c, 400, 'bad_request', ['q']);
    const results = await farmStub(c.env, m.farm).search(m.person, query.data.q);
    return results === null ? fail(c, 404, 'not_found') : c.json(results);
  });

  /** What a visitor sees at another farm's gate: never its chat, and only for friends of friends. */
  app.get('/farms/:id/gate', signedIn, async (c) => {
    const person = c.get('person');
    const farm = farmParam(c);
    if (farm === null || !(await mayVisit(c.env, person, farm))) return fail(c, 404, 'not_found');
    const gate = await farmStub(c.env, farm).gate(person);
    return gate === null ? fail(c, 404, 'not_found') : c.json(gate);
  });

  app.post('/farms/:id/gate', signedIn, async (c) => {
    const person = c.get('person');
    const farm = farmParam(c);
    if (farm === null || !(await mayVisit(c.env, person, farm))) return fail(c, 404, 'not_found');
    const req = await body(c, GateRequest);
    if (req instanceof Response) return req;
    const to = 'to' in req.gesture ? req.gesture.to : null;
    if (to !== null && (await isBlocked(c.env, person, to))) {
      return c.json({
        result: 'rejected',
        opId: req.opId,
        reason: 'unavailable',
      } satisfies CommandResult);
    }
    if (!(await withinGateLimit(c, person))) return fail(c, 429, 'rate_limited');
    const profile = await profileOf(c.env, person);
    if (profile === null) return fail(c, 403, 'forbidden');
    const result = await farmStub(c.env, farm).atGate(person, profile, req.opId, req.gesture);
    if (result.result === 'ack') await noteVisitor(c.env.DB, person, farm, Date.now());
    return c.json(result);
  });

  /**
   * A swap while visiting. Both farms are checked first, writing nothing. The visited farm writes
   * `traded` with its member as actor and owes the visitor's farm its half until that lands; a
   * retry with the same op id finishes the pair, and so does the visited farm's alarm.
   */
  app.post('/farms/:id/trade', signedIn, async (c) => {
    const person = c.get('person');
    const visited = farmParam(c);
    if (visited === null) return fail(c, 404, 'not_found');
    const req = await body(c, TradeRequest);
    if (req instanceof Response) return req;
    if (req.from === visited) return fail(c, 400, 'bad_request', ['from']);
    if ((await roleOf(c.env.DB, req.from, person)) === null) return fail(c, 403, 'forbidden');
    if (!(await mayVisit(c.env, person, visited))) return fail(c, 404, 'not_found');
    const rejected = (reason: RejectReason): CommandResult => ({
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
    // A new trade is checked on both farms before either writes; a retry just finishes the pair.
    if ((await theirs.answered(req.opId)) === null) {
      const reason =
        (await theirs.canTrade(req.from, req.with)) ?? (await ours.canTrade(visited, person));
      if (reason !== null) return c.json(rejected(reason));
    }
    const mine = { with: req.with, otherFarm: visited, gave: give, got: take };
    const first = await theirs.recordTrade(
      req.opId,
      req.with,
      { with: person, otherFarm: req.from, gave: take, got: give },
      { farm: req.from, actor: person, payload: mine },
    );
    if (first.result === 'rejected') return c.json(first);
    let second: CommandResult;
    try {
      second = await ours.recordTrade(req.opId, person, mine);
    } catch {
      return fail(c, 503, 'unavailable');
    }
    await theirs.tradeHalfDone(req.opId);
    if (second.result === 'ack') await noteVisitor(c.env.DB, person, visited, Date.now());
    return c.json(second);
  });

  return app;
};
