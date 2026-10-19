import { EventsPage, FarmList } from '@kithfield/contracts';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { opId, seedReviewFarm, type SeedApi } from '../scripts/review-seed';
import { freshIp, readSignIn, sendCode, signInWithCode } from '../src/auth/testing/client';

// The test environment's `REVIEW_ACCOUNT` (`vitest.config.ts`).
const who = {
  email: 'review@kithfield.test',
  code: '274913',
  companion: 'review.friend@kithfield.test',
};

/** The seed's requests go through the Worker's real routes, from one client address. */
const api = (ip = freshIp()): SeedApi => ({
  origin: 'https://dev.kithfield.com',
  fetch: (url, init) => {
    const headers = new Headers(init.headers);
    headers.set('cf-connecting-ip', ip);
    return exports.default.fetch(url, { ...init, headers });
  },
});

const signedInAs = async (email: string) => {
  expect((await sendCode(email)).status).toBe(200);
  return readSignIn(await signInWithCode(email, who.code));
};

const get = async (path: string, token: string) => {
  const response = await exports.default.fetch(`https://dev.kithfield.com/api${path}`, {
    headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': freshIp() },
  });
  expect(response.status).toBe(200);
  return response.json();
};

describe('the review farm seed', () => {
  it('makes op ids the farm accepts: UUIDv7, in time order', () => {
    const early = opId(Date.UTC(2026, 9, 19));
    const late = opId(Date.UTC(2026, 9, 20));
    expect(early).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(early < late).toBe(true);
  });

  it('plants a lived-in farm through the API, and adds nothing when run again', async () => {
    const seeded = await seedReviewFarm(api(), who);
    expect(seeded).toMatchObject({ status: 'seeded', events: 7 });
    const farm = seeded.farm;

    const reviewer = await signedInAs(who.email);
    const companion = await signedInAs(who.companion);
    for (const person of [reviewer, companion]) {
      const list = FarmList.parse(await get('/v1/farms', person.token));
      expect(list.farms.map((f) => f.farm)).toEqual([farm]);
    }
    const page = EventsPage.parse(await get(`/v1/farms/${farm}/events?after=0`, reviewer.token));
    const kinds = page.events.map((e) => e.kind);
    for (const kind of ['message', 'wave', 'seed_planted', 'rsvp', 'dewdrop']) {
      expect(kinds).toContain(kind);
    }
    expect(kinds.filter((k) => k === 'message')).toHaveLength(3);
    const writers = new Set(page.events.map((e) => e.actor));
    expect([...writers]).toEqual(expect.arrayContaining([reviewer.user.id, companion.user.id]));

    expect(await seedReviewFarm(api(), who)).toEqual({ status: 'already', farm });
    const again = EventsPage.parse(await get(`/v1/farms/${farm}/events?after=0`, reviewer.token));
    expect(again.events).toHaveLength(page.events.length);

    // Every row came from the routes: the farm is listed in D1 like any other.
    const row = await env.DB.prepare('SELECT kind FROM farms WHERE id = ?').bind(farm).first();
    expect(row).toEqual({ kind: 'farm' });
  });
});
