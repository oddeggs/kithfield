import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerMergeStep } from '.';
import { mergeGap, mergeIntoReturning } from './people';
import {
  readSignIn,
  sendCode,
  signInAnonymously,
  signInWithCode,
  watchLetters,
} from './testing/client';

const unregister: (() => void)[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  mergeGap.wait = () => Promise.resolve();
  for (const undo of unregister.splice(0)) undo();
});

async function returningPerson(email: string) {
  const letters = watchLetters();
  await sendCode(email);
  const person = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
  return { person, letters };
}

describe('merging an anonymous person into a returning one', () => {
  it('runs every registered step in the same batch and tells the deletion queue', async () => {
    const email = `merge.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const { person, letters } = await returningPerson(email);
    const seen: { from: string; into: string }[] = [];
    unregister.push(
      registerMergeStep('test-display-name', (db, merge) => {
        seen.push({ from: merge.from, into: merge.into });
        return [
          db.prepare("UPDATE people SET display_name = 'moved over' WHERE id = ?").bind(merge.into),
        ];
      }),
    );
    // Called unbound: a binding's methods are RPC stubs.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const enqueue = env.DELETION_QUEUE.send;
    const queued = vi
      .spyOn(env.DELETION_QUEUE, 'send')
      .mockImplementation((message: unknown) => enqueue(message));

    const laptop = await signInAnonymously();
    await sendCode(email, { token: laptop.token });
    await readSignIn(await signInWithCode(email, letters.codeFor(email), { token: laptop.token }));

    expect(seen).toEqual([{ from: laptop.user.id, into: person.user.id }]);
    const row = await env.DB.prepare('SELECT display_name FROM people WHERE id = ?')
      .bind(person.user.id)
      .first();
    expect(row).toEqual({ display_name: 'moved over' });
    expect(queued).toHaveBeenCalledWith({
      kind: 'person_merged',
      from: laptop.user.id,
      into: person.user.id,
      at: expect.any(Number) as number,
    });
  });

  it('refuses, and changes nothing, when another request upgraded the anonymous person first', async () => {
    const email = `race.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const { person, letters } = await returningPerson(email);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const enqueue = env.DELETION_QUEUE.send;
    const queued = vi
      .spyOn(env.DELETION_QUEUE, 'send')
      .mockImplementation((message: unknown) => enqueue(message));
    const laptop = await signInAnonymously();
    await env.DB.prepare('UPDATE people SET age_ok = 1 WHERE id = ?').bind(laptop.user.id).run();
    // Between this sign-in's checks and its merge, another upgrade of the same person lands.
    mergeGap.wait = async ({ from }) => {
      await env.DB.prepare('UPDATE people SET is_anonymous = 0 WHERE id = ?').bind(from).run();
    };

    await sendCode(email, { token: laptop.token });
    const refused = await signInWithCode(email, letters.codeFor(email), { token: laptop.token });

    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'conflict' });
    expect(queued).not.toHaveBeenCalled();
    const kept = await env.DB.prepare('SELECT is_anonymous FROM people WHERE id = ?')
      .bind(laptop.user.id)
      .first();
    expect(kept).toEqual({ is_anonymous: 0 });
    const returning = await env.DB.prepare(
      'SELECT age_ok, (SELECT COUNT(*) FROM sessions WHERE person_id = ?1) AS sessions FROM people WHERE id = ?1',
    )
      .bind(person.user.id)
      .first();
    expect(returning).toEqual({ age_ok: null, sessions: 1 });
  });

  it('changes nothing when one step fails', async () => {
    const email = `atomic.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const { person } = await returningPerson(email);
    const anonymous = await signInAnonymously();
    await env.DB.prepare('UPDATE people SET age_ok = 1 WHERE id = ?').bind(anonymous.user.id).run();
    unregister.push(
      registerMergeStep('test-broken', (db) => [
        db.prepare('INSERT INTO no_such_table (x) VALUES (1)'),
      ]),
    );

    await expect(
      mergeIntoReturning(env.DB, {
        anonymous: anonymous.user.id,
        returning: person.user.id,
        now: Date.now(),
      }),
    ).rejects.toThrow();

    const kept = await env.DB.prepare('SELECT 1 AS here FROM people WHERE id = ?')
      .bind(anonymous.user.id)
      .first();
    expect(kept).toEqual({ here: 1 });
    const unchanged = await env.DB.prepare('SELECT age_ok FROM people WHERE id = ?')
      .bind(person.user.id)
      .first();
    expect(unchanged).toEqual({ age_ok: null });
  });
});
