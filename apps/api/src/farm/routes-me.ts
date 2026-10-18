import {
  Critter,
  FarmList,
  FarmNotifications,
  type FarmNotificationsView,
  NotificationType,
} from '@kithfield/contracts';
import type { z } from 'zod';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { DEFAULT_KNOCK_FOR } from '../cottage/chats';
import { cottageOf } from '../cottage/stub';
import { cottage } from './adapters/cottage';
import { body, fail, member, signedIn } from './http';

/* The caller's farms: the valley switcher, and which kinds of news each farm may push (and rest). */

/** "Muted until turned back on", as the cottage and D1 keep it. */
const ALWAYS = Number.MAX_SAFE_INTEGER;

type Row = {
  id: string;
  kind: 'farm' | 'visit';
  name: string | null;
  land: string;
  role: 'keeper' | 'helper' | 'critter';
  joined_at: number;
  peer: string | null;
  peer_name: string | null;
  peer_critter: string | null;
};

/** "Knock for" as D1 keeps it: null (or anything unreadable) is the defaults. */
const knockForOf = (json: string | null): FarmNotifications['knockFor'] => {
  if (json === null) return DEFAULT_KNOCK_FOR;
  try {
    const parsed = FarmNotifications.shape.knockFor.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : DEFAULT_KNOCK_FOR;
  } catch {
    return DEFAULT_KNOCK_FOR;
  }
};

const peerCritter = (json: string | null) => {
  const parsed = Critter.safeParse(json === null ? null : JSON.parse(json));
  return parsed.success ? parsed.data : null;
};

export const meRoutes = (): Hono<SessionEnv> => {
  const app = new Hono<SessionEnv>();

  /** `GET /v1/farms`: every farm and visit the caller lives on. A visit shows the other person. */
  app.get('/farms', signedIn, async (c) => {
    const person = c.get('person');
    const { results } = await c.env.DB.prepare(
      `SELECT f.id, f.kind, f.name, f.land, m.role, m.joined_at,
         o.person_id AS peer, p.display_name AS peer_name, p.critter AS peer_critter
       FROM memberships m JOIN farms f ON f.id = m.farm_id
       LEFT JOIN memberships o ON f.kind = 'visit' AND o.farm_id = f.id AND o.person_id <> m.person_id
         AND o.left_at IS NULL
       LEFT JOIN people p ON p.id = o.person_id AND p.deleted_at IS NULL
       WHERE m.person_id = ? AND m.left_at IS NULL
       ORDER BY m.joined_at LIMIT 500`,
    )
      .bind(person)
      .all<Row>();
    type Item = z.input<typeof FarmList>['farms'][number];
    const farms = results.flatMap((r): Item[] => {
      const common = {
        farm: r.id,
        kind: r.kind,
        land: r.land,
        role: r.role,
        joinedAt: r.joined_at,
      };
      if (r.kind === 'farm')
        return r.name === null ? [] : [{ ...common, name: r.name, with: null }];
      const critter = peerCritter(r.peer_critter);
      if (r.peer === null || critter === null) return [];
      return [{ ...common, name: null, with: { person: r.peer, name: r.peer_name, critter } }];
    });
    return c.json(FarmList.parse({ farms }));
  });

  /** `PUT /v1/farms/:id/notifications`: mute, and which kinds of news may push. Only the caller hears it. */
  app.put('/farms/:id/notifications', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const req = await body(c, FarmNotifications);
    if (req instanceof Response) return req;
    const until = req.mutedUntil === 'always' ? ALWAYS : req.mutedUntil;
    await c.env.DB.prepare(
      'UPDATE memberships SET muted_until = ?, knock_for = ? WHERE farm_id = ? AND person_id = ?',
    )
      .bind(until, JSON.stringify(req.knockFor), m.farm, m.person)
      .run();
    try {
      await cottage.setFarmNotifications(c.env, m.person, m.farm, req);
    } catch {
      return fail(c, 503, 'unavailable');
    }
    return c.json(req);
  });

  /**
   * `GET /v1/farms/:id/notifications`: the caller's mute and "Knock for" on this farm, and the
   * kinds of push resting there after three went unopened.
   */
  app.get('/farms/:id/notifications', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const row = await c.env.DB.prepare(
      'SELECT muted_until, knock_for FROM memberships WHERE farm_id = ? AND person_id = ?',
    )
      .bind(m.farm, m.person)
      .first<{ muted_until: number | null; knock_for: string | null }>();
    const until = row?.muted_until ?? null;
    const now = Date.now();
    let resting: FarmNotificationsView['resting'];
    try {
      resting = await cottageOf(c.env, m.person).restingOn(m.farm);
    } catch {
      return fail(c, 503, 'unavailable');
    }
    const view: FarmNotificationsView = {
      mutedUntil: until === null || until <= now ? null : until >= ALWAYS ? 'always' : until,
      knockFor: knockForOf(row?.knock_for ?? null),
      resting,
    };
    return c.json(view);
  });

  /** `DELETE /v1/farms/:id/notifications/resting/:type`: turns a resting kind of push back on. */
  app.delete('/farms/:id/notifications/resting/:type', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const type = NotificationType.safeParse(c.req.param('type'));
    if (!type.success) return fail(c, 400, 'bad_request', ['type']);
    try {
      await cottageOf(c.env, m.person).wakeResting(m.farm, type.data);
    } catch {
      return fail(c, 503, 'unavailable');
    }
    return c.body(null, 204);
  });

  return app;
};
