import { WaitlistResponse } from '@kithfield/contracts';
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from '../src/index';
import { UNCONFIRMED_KEEP_MS, waitlistEmailHash } from '../src/web/waitlist-store';
import {
  age,
  confirm,
  join,
  joinAndReadToken,
  joinWithPick,
  KEY,
  mockLetters,
  pickFrom,
  rowFor,
  savePick,
} from './support/waitlist';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PUT /api/v1/waitlist/pick', () => {
  it('saves a critter that the row takes when the address confirms', async () => {
    const { pick, token } = await joinWithPick('picker@example.com');
    expect((await savePick(pick, 'bear')).status).toBe(204);
    expect((await savePick(pick, 'frog')).status).toBe(204);
    expect((await rowFor('picker@example.com'))?.species).toBeNull();
    expect((await confirm(token)).status).toBe(204);
    expect((await rowFor('picker@example.com'))?.species).toBe('frog');
  });

  it('binds a pick from a second sign-up to the letter already waiting', async () => {
    const { token } = await joinWithPick('second@example.com');
    const send = mockLetters();
    const pick = await pickFrom(await join({ email: 'second@example.com', lang: 'en' }));
    expect(send).not.toHaveBeenCalled();
    expect((await savePick(pick, 'mole')).status).toBe(204);
    expect((await confirm(token)).status).toBe(204);
    expect((await rowFor('second@example.com'))?.species).toBe('mole');
  });

  it('keeps but never uses a pick made for an address confirmed before it', async () => {
    const { pick: early, token } = await joinWithPick('done@example.com');
    expect((await savePick(early, 'cat')).status).toBe(204);
    expect((await confirm(token)).status).toBe(204);
    const late = await pickFrom(await join({ email: 'done@example.com', lang: 'en' }));
    expect((await savePick(late, 'bear')).status).toBe(204);
    expect((await rowFor('done@example.com'))?.species).toBe('cat');
  });

  it('answers the same for a listed and an unlisted address', async () => {
    await joinAndReadToken('listed@example.com');
    mockLetters();
    const listed = await join({ email: 'listed@example.com', lang: 'en' });
    const unlisted = await join({ email: 'unlisted@example.com', lang: 'en' });
    expect(listed.status).toBe(unlisted.status);
    const bodies = [await listed.json(), await unlisted.json()];
    expect(bodies.map((b) => Object.keys(b as object))).toEqual([['pick'], ['pick']]);
    for (const body of bodies) WaitlistResponse.parse(body);
  });

  it('turns away an unknown or week-old pick, and a malformed one', async () => {
    const unknown = 'a'.repeat(43);
    expect((await savePick(unknown)).status).toBe(410);
    const { pick } = await joinWithPick('stale-pick@example.com');
    await env.DB.prepare('UPDATE waitlist_picks SET requested_at = requested_at - ?')
      .bind(UNCONFIRMED_KEEP_MS + 1)
      .run();
    const gone = await savePick(pick);
    expect(gone.status).toBe(410);
    expect(await gone.json()).toEqual({ error: { code: 'not_found' } });
    expect((await savePick('short')).status).toBe(400);
    const { pick: fresh } = await joinWithPick('species@example.com');
    expect((await savePick(fresh, 'dragon')).status).toBe(400);
  });
});

describe('the daily retention job', () => {
  it('deletes week-old unconfirmed rows and the addresses the launch letter reached', async () => {
    await joinAndReadToken('stale@example.com');
    await age('stale@example.com', UNCONFIRMED_KEEP_MS + 1);
    const staleHash = await waitlistEmailHash(KEY, 'stale@example.com');
    await env.DB.prepare(
      'UPDATE waitlist_picks SET requested_at = requested_at - ? WHERE email_hash = ?',
    )
      .bind(UNCONFIRMED_KEEP_MS + 1, staleHash)
      .run();
    const kept = await joinAndReadToken('kept@example.com');
    expect((await confirm(kept)).status).toBe(204);
    await age('kept@example.com', UNCONFIRMED_KEEP_MS * 2);
    const sent = await joinAndReadToken('sent@example.com');
    expect((await confirm(sent)).status).toBe(204);
    await env.DB.prepare('UPDATE waitlist SET notified_at = ? WHERE email_hash = ?')
      .bind(Date.now(), await waitlistEmailHash(KEY, 'sent@example.com'))
      .run();

    const ctx = createExecutionContext();
    worker.scheduled(
      createScheduledController({ scheduledTime: Date.now(), cron: '17 3 * * *' }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(await rowFor('stale@example.com')).toBeNull();
    const picks = await env.DB.prepare(
      'SELECT count(*) AS n FROM waitlist_picks WHERE email_hash = ?',
    )
      .bind(staleHash)
      .first<{ n: number }>();
    expect(picks?.n).toBe(0);
    expect(await rowFor('kept@example.com')).toMatchObject({ email: 'kept@example.com' });
    expect(await rowFor('sent@example.com')).toMatchObject({ email: null });
  });
});
