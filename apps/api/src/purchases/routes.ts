import {
  ArtId,
  BookOrderRequest,
  ChipInPledgeRequest,
  ChipInStartRequest,
  CostsReport,
  CritterVoteRequest,
  FarmPlusChoice,
  GiftPaidRequest,
  GiftStartRequest,
  Id,
  PersonId,
  WallNameRequest,
  type ChipInList,
  type ChipInOffer,
  type CritterVote,
  type FarmThemes,
  type Wishlist,
} from '@kithfield/contracts';
import { localDay, seasonOf } from '@kithfield/farm';
import { Hono } from 'hono';

import { eitherBlocked, type SessionEnv } from '../auth';
import { roleOf } from '../farm/d1';
import { body, type Ctx, fail, farmStub, member, signedIn } from '../farm/http';
import { bookOrder, bookQuote, orderBook } from './book';
import { catalogItem, CHIP_IN_TIERS, chipInProduct, isWardrobe } from './catalog';
import { farmChipIns, pledge, startChipIn } from './chip-ins';
import { voteKey, VOTES } from './config';
import { entitlementsOf, everPatron, perksOn } from './entitlements';
import { giftPaid, giftView, type Refusal, startGift } from './gifts';
import { syncFromRevenueCat } from './revenuecat';
import { cartFor } from './rotation';
import { catalogView, collectionOf, keepable, patronOffer, wallPage, wallSortKey } from './shop';
import { webhookRoutes } from './webhooks';

/* The shop, patrons, wishlists, gifts, chip-ins, farm themes, the printed book and the costs. */

const WISHLIST_MAX = 30;

const refused = (c: Ctx, r: Refusal) => fail(c, r.status, r.code, r.fields);
const isRefusal = (x: object): x is Refusal => 'status' in x && 'code' in x;

const param = <T>(
  c: Ctx,
  name: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
) => {
  const parsed = schema.safeParse(c.req.param(name));
  return parsed.success ? (parsed.data as T) : null;
};

const shopRoutes = (app: Hono<SessionEnv>) => {
  app.get('/shop/catalog', signedIn, (c) => c.json(catalogView(Date.now())));
  app.get('/shop/cart', signedIn, (c) => c.json(cartFor(Date.now())));

  /** Patrons keep anything in the wardrobe; it stays theirs if patronage lapses. */
  app.post('/shop/items/:item/keep', signedIn, async (c) => {
    const person = c.get('person');
    const item = param<string>(c, 'item', ArtId);
    if (item === null || !keepable(item)) return fail(c, 404, 'not_found');
    const now = Date.now();
    if (!(await perksOn(c.env.DB, person, now))) return fail(c, 403, 'forbidden');
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO owned_items (person_id, item, via, from_id, at) VALUES (?, ?, 'patron', NULL, ?)`,
    )
      .bind(person, item, now)
      .run();
    return c.json(await entitlementsOf(c.env.DB, person, now));
  });

  app.get('/me/collection', signedIn, async (c) =>
    c.json(await collectionOf(c.env.DB, c.get('person'))),
  );
  app.get('/me/entitlements', signedIn, async (c) =>
    c.json(await entitlementsOf(c.env.DB, c.get('person'), Date.now())),
  );

  /** After a purchase or a restore: asks RevenueCat at once rather than waiting for its webhook. */
  app.post('/purchases/sync', signedIn, async (c) => {
    const person = c.get('person');
    const now = Date.now();
    await syncFromRevenueCat(c.env, person, now);
    return c.json(await entitlementsOf(c.env.DB, person, now));
  });
};

const patronRoutes = (app: Hono<SessionEnv>) => {
  app.get('/patrons/offer', signedIn, (c) => c.json(patronOffer(Date.now())));

  app.put('/me/farm-plus', signedIn, async (c) => {
    const person = c.get('person');
    const req = await body(c, FarmPlusChoice);
    if (req instanceof Response) return req;
    const now = Date.now();
    const mine = await entitlementsOf(c.env.DB, person, now);
    if (mine.farmPlus === null) return fail(c, 403, 'forbidden');
    if ((await roleOf(c.env.DB, req.farm, person)) === null) return fail(c, 404, 'not_found');
    await c.env.DB.prepare(
      `INSERT INTO farm_plus (payer_id, farm_id, chosen_at) VALUES (?, ?, ?)
       ON CONFLICT (payer_id) DO UPDATE SET farm_id = excluded.farm_id, chosen_at = excluded.chosen_at`,
    )
      .bind(person, req.farm, now)
      .run();
    return c.body(null, 204);
  });

  app.get('/patrons/wall', signedIn, async (c) =>
    c.json(await wallPage(c.env.DB, c.req.query('after') ?? null)),
  );

  /** The name a patron shows on the wall; it stays after patronage lapses. */
  app.put('/me/wall', signedIn, async (c) => {
    const person = c.get('person');
    const req = await body(c, WallNameRequest);
    if (req instanceof Response) return req;
    if (!(await everPatron(c.env.DB, person))) return fail(c, 403, 'forbidden');
    if (req.name === null) {
      await c.env.DB.prepare('DELETE FROM wall_names WHERE person_id = ?').bind(person).run();
      return c.body(null, 204);
    }
    const name = req.name.trim();
    if (name === '') return fail(c, 400, 'bad_request', ['name']);
    await c.env.DB.prepare(
      `INSERT INTO wall_names (person_id, name, sort_key, at) VALUES (?, ?, ?, ?)
       ON CONFLICT (person_id) DO UPDATE SET name = excluded.name, sort_key = excluded.sort_key, at = excluded.at`,
    )
      .bind(person, name, wallSortKey(name), Date.now())
      .run();
    return c.body(null, 204);
  });

  const season = () => seasonOf(localDay(Date.now(), 'UTC'), 'north');

  app.get('/patrons/vote', signedIn, async (c) => {
    const person = c.get('person');
    if (!(await perksOn(c.env.DB, person, Date.now()))) return fail(c, 403, 'forbidden');
    const now = season();
    const key = voteKey(now.season, now.year);
    const options = VOTES[key];
    if (options === undefined) return fail(c, 404, 'not_found');
    const mine = await c.env.DB.prepare(
      'SELECT option FROM critter_votes WHERE person_id = ? AND season = ?',
    )
      .bind(person, key)
      .first<{ option: string }>();
    return c.json({
      season: now,
      options: [...options],
      mine: mine?.option ?? null,
    } satisfies CritterVote);
  });

  app.put('/patrons/vote', signedIn, async (c) => {
    const person = c.get('person');
    const req = await body(c, CritterVoteRequest);
    if (req instanceof Response) return req;
    if (!(await perksOn(c.env.DB, person, Date.now()))) return fail(c, 403, 'forbidden');
    const now = season();
    const key = voteKey(now.season, now.year);
    if (!(VOTES[key] ?? []).includes(req.option)) return fail(c, 400, 'bad_request', ['option']);
    await c.env.DB.prepare(
      `INSERT INTO critter_votes (person_id, season, option, at) VALUES (?, ?, ?, ?)
       ON CONFLICT (person_id, season) DO UPDATE SET option = excluded.option, at = excluded.at`,
    )
      .bind(person, key, req.option, Date.now())
      .run();
    return c.body(null, 204);
  });
};

/** A wish comes true once the item is theirs: owned items drop off the list (and come back if not). */
const wishlistOf = async (db: D1Database, person: string): Promise<Wishlist> => ({
  items: (
    await db
      .prepare(
        `SELECT w.item, w.at FROM wishlists w
         WHERE w.person_id = ?
           AND NOT EXISTS (SELECT 1 FROM owned_items o WHERE o.person_id = w.person_id AND o.item = w.item)
         ORDER BY w.at, w.item LIMIT ?`,
      )
      .bind(person, WISHLIST_MAX)
      .all<{ item: string; at: number }>()
  ).results,
});

const wishlistRoutes = (app: Hono<SessionEnv>) => {
  app.get('/me/wishlist', signedIn, async (c) =>
    c.json(await wishlistOf(c.env.DB, c.get('person'))),
  );

  app.put('/me/wishlist/:item', signedIn, async (c) => {
    const person = c.get('person');
    const item = catalogItem(param<string>(c, 'item', ArtId) ?? '');
    if (item === null || !(isWardrobe(item) || item.kind === 'sticker_pack')) {
      return fail(c, 404, 'not_found');
    }
    const count = await c.env.DB.prepare(
      'SELECT count(*) AS n, sum(item = ?) AS here FROM wishlists WHERE person_id = ?',
    )
      .bind(item.item, person)
      .first<{ n: number; here: number | null }>();
    if ((count?.here ?? 0) === 0 && (count?.n ?? 0) >= WISHLIST_MAX)
      return fail(c, 409, 'conflict');
    await c.env.DB.prepare('INSERT OR IGNORE INTO wishlists (person_id, item, at) VALUES (?, ?, ?)')
      .bind(person, item.item, Date.now())
      .run();
    return c.body(null, 204);
  });

  app.delete('/me/wishlist/:item', signedIn, async (c) => {
    const item = param<string>(c, 'item', ArtId);
    if (item === null) return fail(c, 404, 'not_found');
    await c.env.DB.prepare('DELETE FROM wishlists WHERE person_id = ? AND item = ?')
      .bind(c.get('person'), item)
      .run();
    return c.body(null, 204);
  });

  /** A friend's wishes, on their critter card: members of a shared farm only; nobody is told. */
  app.get('/farms/:id/members/:person/wishlist', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const friend = param<string>(c, 'person', PersonId);
    if (friend === null || (await roleOf(c.env.DB, m.farm, friend)) === null) {
      return fail(c, 404, 'not_found');
    }
    if (friend !== m.person && (await eitherBlocked(c.env.DB, m.person, friend))) {
      return fail(c, 404, 'not_found');
    }
    return c.json(await wishlistOf(c.env.DB, friend));
  });
};

const giftRoutes = (app: Hono<SessionEnv>) => {
  app.post('/gifts', signedIn, async (c) => {
    const req = await body(c, GiftStartRequest);
    if (req instanceof Response) return req;
    const out = await startGift(c.env, c.get('person'), req, Date.now());
    return isRefusal(out) ? refused(c, out) : c.json(out);
  });

  app.post('/gifts/:gift/paid', signedIn, async (c) => {
    const gift = param<string>(c, 'gift', Id);
    if (gift === null) return fail(c, 404, 'not_found');
    const req = await body(c, GiftPaidRequest);
    if (req instanceof Response) return req;
    const out = await giftPaid(c.env, c.get('person'), gift, req, Date.now());
    return isRefusal(out) ? refused(c, out) : c.json(out);
  });

  app.get('/gifts/:gift', signedIn, async (c) => {
    const gift = param<string>(c, 'gift', Id);
    const view = gift === null ? null : await giftView(c.env.DB, c.get('person'), gift);
    return view === null ? fail(c, 404, 'not_found') : c.json(view);
  });

  app.post('/farms/:id/chip-ins', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const req = await body(c, ChipInStartRequest);
    if (req instanceof Response) return req;
    const out = await startChipIn(c.env, m.person, m.farm, req, Date.now());
    return isRefusal(out) ? refused(c, out) : c.json(out);
  });

  app.get('/farms/:id/chip-ins', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const list: ChipInList = { chipIns: await farmChipIns(c.env, m.person, m.farm, Date.now()) };
    return c.json(list);
  });

  app.get('/chip-ins/offer', signedIn, (c) =>
    c.json({ tiers: CHIP_IN_TIERS.map(chipInProduct) } satisfies ChipInOffer),
  );

  app.post('/chip-ins/:chipIn/pledges', signedIn, async (c) => {
    const id = param<string>(c, 'chipIn', Id);
    if (id === null) return fail(c, 404, 'not_found');
    const req = await body(c, ChipInPledgeRequest);
    if (req instanceof Response) return req;
    const out = await pledge(c.env, c.get('person'), id, req, Date.now());
    return isRefusal(out) ? refused(c, out) : c.json(out);
  });

  app.get('/farms/:id/themes', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const { results } = await c.env.DB.prepare(
      'SELECT theme FROM farm_themes WHERE farm_id = ? ORDER BY at, theme',
    )
      .bind(m.farm)
      .all<{ theme: string }>();
    const state = await farmStub(c.env, m.farm).state();
    return c.json({
      owned: results.map((r) => r.theme),
      current: state?.theme ?? null,
    } satisfies FarmThemes);
  });
};

const bookRoutes = (app: Hono<SessionEnv>) => {
  const yearOf = (raw: string | undefined) =>
    raw !== undefined && /^\d{4}$/.test(raw) && Number(raw) >= 2026 ? Number(raw) : null;

  app.get('/farms/:id/book', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const year = yearOf(c.req.query('year') ?? String(new Date().getUTCFullYear()));
    if (year === null) return fail(c, 400, 'bad_request', ['year']);
    return c.json(await bookQuote(c.env, m.person, m.farm, year));
  });

  /** Checkout goes through the provider seam; with none set up yet, "not available yet". */
  app.post('/farms/:id/book/orders', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const req = await body(c, BookOrderRequest);
    if (req instanceof Response) return req;
    const checkout = await orderBook(c.env, m.person, m.farm, req);
    return checkout === null ? fail(c, 503, 'unavailable') : c.json(checkout);
  });

  app.get('/book-orders/:order', signedIn, async (c) => {
    const order = param<string>(c, 'order', Id);
    const view = order === null ? null : await bookOrder(c.env.DB, c.get('person'), order);
    return view === null ? fail(c, 404, 'not_found') : c.json(view);
  });

  /** The open books page: public, no session. */
  app.get('/costs', async (c) => {
    const month = c.req.query('month');
    if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return fail(c, 400, 'bad_request', ['month']);
    }
    const row = await (
      month === undefined
        ? c.env.DB.prepare('SELECT report_json FROM costs_reports ORDER BY month DESC LIMIT 1')
        : c.env.DB.prepare('SELECT report_json FROM costs_reports WHERE month = ?').bind(month)
    ).first<{ report_json: string }>();
    const report = row === null ? null : CostsReport.safeParse(JSON.parse(row.report_json));
    return report?.success === true ? c.json(report.data) : fail(c, 404, 'not_found');
  });
};

/** Every purchases route, mounted at `/v1`. */
export const purchasesRoutes = (): Hono<SessionEnv> => {
  const app = new Hono<SessionEnv>();
  shopRoutes(app);
  patronRoutes(app);
  wishlistRoutes(app);
  giftRoutes(app);
  bookRoutes(app);
  app.route('/', webhookRoutes());
  return app;
};
