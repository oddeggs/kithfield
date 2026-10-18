import {
  PersonId,
  RecapQuery,
  ScrapbookQuery,
  WeatherAttributionQuery,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { type Ctx, fail, farmStub, member, signedIn } from '../farm/http';
import { weatherAttribution } from './attribution';
import { gateList } from './gates';
import { readerLang, weeklyRecap } from './recap';

/* The farm's rhythm over HTTP, mounted at `/v1`. */

const badQuery = (c: Ctx, issues: readonly { path: readonly PropertyKey[] }[]) =>
  fail(
    c,
    400,
    'bad_request',
    issues.map((i) => i.path.map(String).join('.')),
  );

export const rhythmRoutes = (): Hono<SessionEnv> => {
  const app = new Hono<SessionEnv>();

  /** The weather provider's mark and legal link, shown wherever the weather appears. */
  app.get('/weather/attribution', signedIn, async (c) => {
    const query = WeatherAttributionQuery.safeParse(c.req.query());
    if (!query.success) return badQuery(c, query.error.issues);
    let attribution;
    try {
      attribution = await weatherAttribution(query.data.source, query.data.lang);
    } catch (error) {
      console.error('weather attribution unavailable', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      return fail(c, 503, 'unavailable');
    }
    if (attribution === null) return fail(c, 404, 'not_found');
    return c.json(attribution);
  });

  /** The farms this person may visit (friends of friends), or those of one friend. */
  app.get('/gates', signedIn, async (c) => {
    const { success } = await c.env.GATES_LIMIT.limit({ key: c.get('person') });
    if (!success) return fail(c, 429, 'rate_limited');
    const raw = c.req.query('person');
    const friend = raw === undefined ? null : PersonId.safeParse(raw);
    if (friend !== null && !friend.success) return fail(c, 400, 'bad_request', ['person']);
    return c.json(await gateList(c.env, c.get('person'), friend?.data ?? null));
  });

  /** The farm's scrapbook, newest pages first, for its members. */
  app.get('/farms/:id/scrapbook', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const query = ScrapbookQuery.safeParse(c.req.query());
    if (!query.success) return badQuery(c, query.error.issues);
    const book = await farmStub(c.env, m.farm).scrapbook(m.person, query.data.before ?? null);
    return book === null ? fail(c, 404, 'not_found') : c.json(book);
  });

  /** The Sunday recap of a week (by its Sunday, farm time; the latest without one), for members. */
  app.get('/farms/:id/recap', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const query = RecapQuery.safeParse(c.req.query());
    if (!query.success) return badQuery(c, query.error.issues);
    const facts = await farmStub(c.env, m.farm).recapFacts(m.person, query.data.week ?? null);
    if (facts === null) return fail(c, 404, 'not_found');
    if (facts === 'bad_week') return fail(c, 400, 'bad_request', ['week']);
    const lang = await readerLang(c.env, m.person, c.req.header('Accept-Language'));
    return c.json(await weeklyRecap(c.env, m.farm, lang, facts, Date.now()));
  });

  return app;
};
