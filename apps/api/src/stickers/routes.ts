import {
  PersonId,
  TogetherAskAnswer,
  type TogetherAskList,
  type TogetherExportConsents,
  TogetherExportRequest,
  type TogetherPeople,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import { roleOf } from '../farm/d1';
import { body, fail, member, signedIn } from '../farm/http';
import { answerAsk, askToExport, asksOf, drawablePeople } from './together-store';

/*
 * Together stickers: who on a farm can be drawn into one, and the yes every friend in one gives
 * before it leaves Kithfield. Each friend is asked once by each asker; the asker only ever learns
 * who said yes, so a no looks the same as no answer yet.
 */
export function stickersRoutes(): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();

  app.get('/farms/:id/together', signedIn, async (c) => {
    const m = await member(c);
    if (m instanceof Response) return m;
    const people = await drawablePeople(c.env, m.farm, m.person);
    return c.json({ people } satisfies TogetherPeople);
  });

  app.post('/stickers/together/export', signedIn, async (c) => {
    const req = await body(c, TogetherExportRequest);
    if (req instanceof Response) return req;
    const asker = c.get('person');
    if ((await roleOf(c.env.DB, req.farm, asker)) === null) return fail(c, 404, 'not_found');
    const people = [...new Set(req.people)];
    if (people.includes(asker)) return fail(c, 400, 'bad_request', ['people']);
    const drawable = new Set(await drawablePeople(c.env, req.farm, asker));
    if (people.some((p) => !drawable.has(p))) return fail(c, 404, 'not_found');
    const ok = await askToExport(c.env.DB, { asker, farm: req.farm, people, at: Date.now() });
    return c.json({ ok } satisfies TogetherExportConsents);
  });

  app.get('/stickers/together/asks', signedIn, async (c) =>
    c.json((await asksOf(c.env.DB, c.get('person'))) satisfies TogetherAskList),
  );

  app.put('/stickers/together/asks/:person', signedIn, async (c) => {
    const asker = PersonId.safeParse(c.req.param('person'));
    if (!asker.success) return fail(c, 404, 'not_found');
    const req = await body(c, TogetherAskAnswer);
    if (req instanceof Response) return req;
    const answered = await answerAsk(c.env.DB, {
      subject: c.get('person'),
      asker: asker.data,
      ok: req.ok,
      at: Date.now(),
    });
    return answered ? c.body(null, 204) : fail(c, 404, 'not_found');
  });

  return app;
}
