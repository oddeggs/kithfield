import { PersonId, WeatherAttributionQuery } from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { type Ctx, fail, signedIn } from '../farm/http';
import { weatherAttribution } from './attribution';
import { gateList } from './gates';

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
    const raw = c.req.query('person');
    const friend = raw === undefined ? null : PersonId.safeParse(raw);
    if (friend !== null && !friend.success) return fail(c, 400, 'bad_request', ['person']);
    return c.json(await gateList(c.env, c.get('person'), friend?.data ?? null));
  });

  return app;
};
