import { KNOWN_POLLINATOR_REASONS, WeeklyRecap } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import worker from '../../src/index';
import { recapLetters, unwrittenLetters } from '../../src/rhythm/letters';
import { recapFacts } from '../../src/rhythm/recap-facts';
import { op } from '../farm/support/client';
import {
  api,
  cast,
  hostOf,
  type Person,
  plantFarm,
  type TestPorts,
  useTestPorts,
} from '../farm/support/doubles';

/*
 * Weeks in 2054, whose calendar is 2026's: Sunday 18 October ends the week from Monday the 12th.
 * Farms are planted on 1 October, so everyone has lived there a while.
 */

let ports: TestPorts;
beforeEach(() => {
  ports = useTestPorts({ at: noon('2054-10-01') });
});
afterEach(() => {
  recapLetters.current = unwrittenLetters;
});

function noon(day: string): number {
  return Date.parse(`${day}T12:00:00Z`);
}

let run = 0;

type Farm = Awaited<ReturnType<typeof plantFarm>>;

/** A command on a farm day, through the object; returns its seq. */
const on = async (day: string, farm: Farm, person: Person, kind: string, payload: unknown) => {
  ports.clock.at = Math.max(ports.clock.at, noon(day));
  run++;
  const written = await farm.stub.command(person.id, {
    opId: op(run, 9),
    kind,
    payload,
  } as never);
  expect(written, `${kind} on ${day}`).toMatchObject({ result: 'ack' });
  return (written as { seq: number }).seq;
};

const recap = async (person: Person | null, farm: Farm, query = '') => {
  const response = await api(person, 'GET', `/v1/farms/${farm.farm}/recap${query}`);
  return { status: response.status, body: response.body };
};

const readRecap = async (person: Person, farm: Farm, query = '') => {
  const { status, body } = await recap(person, farm, query);
  expect(status).toBe(200);
  return WeeklyRecap.parse(body);
};

const kindsOf = (r: WeeklyRecap) => Object.fromEntries(r.thanks.map((t) => [t.person, t.kinds]));

describe('the Sunday recap', () => {
  it('thanks everyone who tended with the kinds of care they gave, never a count', async () => {
    const { pip, fig, bea, kit } = await cast('pip', 'fig', 'bea', 'kit');
    const farm = await plantFarm(pip, [fig, bea, kit]);
    await on('2054-10-11', farm, kit, 'message', { text: 'last week' });
    await on('2054-10-12', farm, bea, 'message', { text: 'hello' });
    await on('2054-10-13', farm, pip, 'message', { text: 'one' });
    await on('2054-10-13', farm, pip, 'message', { text: 'two' });
    await on('2054-10-13', farm, pip, 'wave', { to: fig.id });
    await on('2054-10-14', farm, fig, 'dewdrop', { to: pip.id });
    await on('2054-10-15', farm, pip, 'removed', { person: bea.id, removeMedia: false });
    ports.clock.at = noon('2054-10-18');
    const read = await readRecap(fig, farm);
    expect(read.week).toBe('2054-10-18');
    // The quiet dewdrop is thanked too; Bea, removed since, is not.
    expect(read.thanks).toEqual([
      { person: pip.id, kinds: ['message', 'wave'] },
      { person: fig.id, kinds: ['dewdrop'] },
    ]);
    expect(read.letterState).toBe('none');
    expect(read.letter).toBeNull();
    expect(Object.keys(read).sort()).toEqual(
      ['farm', 'week', 'pollinator', 'thanks', 'plans', 'letterState', 'letter'].sort(),
    );
  });

  it('thanks a former member who left by choice, after the members, but nobody removed or deleted', async () => {
    const { pip, fig, bea, mo } = await cast('pip', 'fig', 'bea', 'mo');
    const farm = await plantFarm(pip, [fig, bea, mo]);
    await on('2054-10-12', farm, fig, 'message', { text: 'bye for now' });
    await on('2054-10-12', farm, bea, 'message', { text: 'hello' });
    await on('2054-10-12', farm, mo, 'message', { text: 'hi all' });
    await on('2054-10-13', farm, pip, 'message', { text: 'hello back' });
    await on('2054-10-14', farm, fig, 'left', {});
    await on('2054-10-14', farm, pip, 'removed', { person: bea.id, removeMedia: false });
    await hostOf(farm.stub, (host) =>
      host.farm.write(mo.id, 'left', { how: 'account_deleted' }, ports.clock.at),
    );
    ports.clock.at = noon('2054-10-18');
    expect((await readRecap(pip, farm)).thanks).toEqual([
      { person: pip.id, kinds: ['message'] },
      { person: fig.id, kinds: ['message'] },
    ]);
  });

  it('is the latest Sunday without a week, and refuses a week that is not a Sunday come', async () => {
    const { pip } = await cast('pip');
    const farm = await plantFarm(pip);
    await on('2054-10-14', farm, pip, 'message', { text: 'midweek' });
    ports.clock.at = noon('2054-10-21');
    expect((await readRecap(pip, farm)).week).toBe('2054-10-18');
    expect((await readRecap(pip, farm, '?week=2054-10-11')).thanks).toEqual([]);
    expect((await recap(pip, farm, '?week=2054-10-17')).status).toBe(400);
    expect((await recap(pip, farm, '?week=2054-10-25')).status).toBe(400);
    expect((await recap(pip, farm, '?week=soon')).status).toBe(400);
  });

  it("credits a hangout's check-ins and shared rain, and lists the week's plans", async () => {
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const farm = await plantFarm(pip, [fig, bea]);
    const seed = await on('2054-10-12', farm, pip, 'seed_planted', {
      title: 'Picnic',
      days: [{ date: '2054-10-14' }],
      place: { name: 'The park' },
      yeses: 'couple',
      someday: false,
    });
    await on('2054-10-12', farm, pip, 'rsvp', { seed, answer: 'in' });
    await on('2054-10-12', farm, fig, 'rsvp', { seed, answer: 'in' });
    await on('2054-10-14', farm, pip, 'checkin', { seed });
    await on('2054-10-14', farm, fig, 'checkin', { seed });
    ports.clock.at = noon('2054-10-15');
    await hostOf(farm.stub, (host) =>
      host.farm.write(
        null,
        'shared_rain',
        { day: '2054-10-15', people: [pip.id, fig.id, bea.id] },
        ports.clock.at,
      ),
    );
    ports.clock.at = noon('2054-10-18');
    const read = await readRecap(bea, farm);
    const kinds = kindsOf(read);
    expect(kinds[pip.id]).toEqual(['seed_planted', 'rsvp', 'checkin', 'shared_rain']);
    expect(kinds[fig.id]).toEqual(['rsvp', 'checkin', 'shared_rain']);
    expect(kinds[bea.id]).toEqual(['shared_rain']);
    expect(read.plans).toEqual([seed]);
  });

  it('finds the qualities of the week, each a yes or no', async () => {
    const { pip, fig, bea, kit } = await cast('pip', 'fig', 'bea', 'kit');
    const farm = await plantFarm(pip, [fig, bea, kit]);
    const words = await on('2054-10-12', farm, kit, 'message', { text: 'back again' });
    ports.clock.at = noon('2054-10-12');
    await hostOf(farm.stub, (host) => host.opened(kit.id));
    await on('2054-10-12', farm, bea, 'message', { text: 'mon' });
    await on('2054-10-13', farm, bea, 'message', { text: 'tue' });
    await on('2054-10-13', farm, pip, 'wave', { to: fig.id });
    await on('2054-10-13', farm, pip, 'hug', { to: bea.id });
    await on('2054-10-13', farm, pip, 'dewdrop', { target: words });
    await on('2054-10-14', farm, bea, 'message', { text: 'wed' });
    await on('2054-10-14', farm, fig, 'fire', { state: 'lit' });
    await on('2054-10-14', farm, fig, 'fire', { state: 'sat' });
    await on('2054-10-15', farm, bea, 'message', { text: 'thu' });
    ports.clock.at = noon('2054-10-18');
    const facts = await hostOf(farm.stub, (host) =>
      recapFacts(host.store, host.farm.state!, '2054-10-18'),
    );
    expect(Object.fromEntries(facts.qualities.map((q) => [q.person, q.reasons]))).toEqual({
      [pip.id]: ['checked_on_everyone'],
      [fig.id]: ['by_the_fire'],
      [bea.id]: ['kept_it_warm'],
      [kit.id]: ['came_back'],
    });
    const read = await readRecap(pip, farm);
    expect(read.pollinator).not.toBeNull();
    const chosen = facts.qualities.find((q) => q.person === read.pollinator?.person);
    expect(chosen?.reasons).toContain(read.pollinator?.reason);
    expect(KNOWN_POLLINATOR_REASONS).toContain(read.pollinator?.reason);
  });

  it('picks a best pollinator that stays put for its week and rotates the next', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const farm = await plantFarm(pip, [fig]);
    await on('2054-10-13', farm, pip, 'message', { text: 'hi' });
    await on('2054-10-13', farm, fig, 'message', { text: 'hello' });
    ports.clock.at = noon('2054-10-18');
    const first = (await readRecap(pip, farm)).pollinator;
    expect(first?.reason).toBe('kept_it_warm');
    expect((await readRecap(fig, farm)).pollinator).toEqual(first);
    await on('2054-10-20', farm, pip, 'message', { text: 'again' });
    await on('2054-10-20', farm, fig, 'message', { text: 'again' });
    ports.clock.at = noon('2054-10-25');
    const second = (await readRecap(pip, farm)).pollinator;
    expect(second).not.toBeNull();
    expect(second?.person).not.toBe(first?.person);
    expect((await readRecap(pip, farm, '?week=2054-10-18')).pollinator).toEqual(first);
    const kept = await env.DB.prepare(
      'SELECT week, person_id FROM recap_pollinators WHERE farm_id = ? ORDER BY week',
    )
      .bind(farm.farm)
      .all();
    expect(kept.results).toEqual([
      { week: '2054-10-18', person_id: first?.person },
      { week: '2054-10-25', person_id: second?.person },
    ]);
  });

  it('has no pollinator when nobody tended', async () => {
    const { pip } = await cast('pip');
    const farm = await plantFarm(pip);
    ports.clock.at = noon('2054-10-18');
    const read = await readRecap(pip, farm);
    expect(read.pollinator).toBeNull();
    expect(read.thanks).toEqual([]);
  });

  it('waits on its letter once a member said yes, and serves the letter once written', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const farm = await plantFarm(pip, [fig]);
    ports.clock.at = noon('2054-10-18');
    const yes = { allowed: true, textVersion: '2026-10' };
    expect((await api(fig, 'PUT', '/v1/me/consents/recap', yes)).status).toBe(204);
    expect((await readRecap(pip, farm)).letterState).toBe('writing');
    const asked: unknown[] = [];
    recapLetters.current = {
      letter: (_env, request) => {
        asked.push(request);
        return Promise.resolve({
          letterState: 'written',
          letter: { lang: request.lang, title: 'A quiet week', body: 'Thank you all.' },
        });
      },
    };
    const written = await readRecap(pip, farm);
    expect(written.letter).toEqual({ lang: 'en', title: 'A quiet week', body: 'Thank you all.' });
    expect(asked).toEqual([
      { farm: farm.farm, week: '2054-10-18', lang: 'en', members: [pip.id, fig.id] },
    ]);
  });

  it("forgets a deleted account's weeks as pollinator", async () => {
    const { pip } = await cast('pip');
    const farm = await plantFarm(pip);
    await on('2054-10-13', farm, pip, 'message', { text: 'hi' });
    ports.clock.at = noon('2054-10-18');
    expect((await readRecap(pip, farm)).pollinator?.person).toBe(pip.id);
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(Date.now() - 31 * 86_400_000, pip.id)
      .run();
    const batch = createMessageBatch('kithfield-deletion-dev', [
      {
        id: 'm0',
        timestamp: new Date(),
        attempts: 1,
        body: { kind: 'account_deleted', person: pip.id, at: 0 },
      },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env, ctx);
    expect(await getQueueResult(batch, ctx)).toMatchObject({ explicitAcks: ['m0'] });
    const left = await env.DB.prepare('SELECT 1 FROM recap_pollinators WHERE person_id = ?')
      .bind(pip.id)
      .all();
    expect(left.results).toEqual([]);
  });

  it('is for members only', async () => {
    const { pip, kit } = await cast('pip', 'kit');
    const farm = await plantFarm(pip);
    expect((await recap(kit, farm)).status).toBe(404);
    expect((await recap(null, farm)).status).toBe(401);
  });
});
