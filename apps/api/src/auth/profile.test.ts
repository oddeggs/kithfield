import { Me, type CritterChangedPayload } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerProfileFanOut } from '.';
import { call, signInAnonymously } from './testing/client';

const fox = {
  species: 'fox',
  coat: 'ginger',
  mark: null,
  accessory: 'scarf',
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
} as const;

const unregister: (() => void)[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const undo of unregister.splice(0)) undo();
});

/** A stand-in for the farm fan-out: records what each person's farms would be told. */
function watchFanOut(): { person: string; changed: CritterChangedPayload }[] {
  const told: { person: string; changed: CritterChangedPayload }[] = [];
  unregister.push(
    registerProfileFanOut((_env, person, changed) => {
      told.push({ person, changed });
      return Promise.resolve();
    }),
  );
  return told;
}

async function patchProfile(token: string, body: unknown): Promise<Response> {
  return call('/v1/me/profile', { method: 'PATCH', body, token });
}

async function readMe(token: string): Promise<Me> {
  const response = await call('/v1/me', { token });
  expect(response.status).toBe(200);
  return Me.parse(await response.json());
}

async function storedProfile(person: string) {
  return env.DB.prepare(
    'SELECT display_name, critter, birthday, updated_at FROM people WHERE id = ?',
  )
    .bind(person)
    .first<{
      display_name: string | null;
      critter: string | null;
      birthday: string | null;
      updated_at: string;
    }>();
}

describe('PATCH /v1/me/profile', () => {
  it('stores the name, critter and birthday, answers Me, and tells the farms', async () => {
    const told = watchFanOut();
    const { token, user } = await signInAnonymously();

    const response = await patchProfile(token, { name: 'Pip', critter: fox, birthday: '04-12' });
    expect(response.status).toBe(200);
    const answered = Me.parse(await response.json());
    expect(answered).toMatchObject({
      person: user.id,
      name: 'Pip',
      critter: fox,
      birthday: '04-12',
    });

    expect(await readMe(token)).toMatchObject({ name: 'Pip', critter: fox, birthday: '04-12' });
    expect(told).toEqual([
      { person: user.id, changed: { name: 'Pip', critter: fox, birthday: '04-12' } },
    ]);
  });

  it('tells the farms only what changed, and writes nothing when nothing did', async () => {
    const { token, user } = await signInAnonymously();
    await patchProfile(token, { name: 'Pip', critter: fox, birthday: '04-12' });
    const told = watchFanOut();
    const before = await storedProfile(user.id);

    const same = await patchProfile(token, { name: 'Pip', critter: { ...fox }, birthday: '04-12' });
    expect(same.status).toBe(200);
    expect(told).toEqual([]);
    expect(await storedProfile(user.id)).toEqual(before);

    await patchProfile(token, { name: 'Pip', birthday: null });
    expect(told).toEqual([{ person: user.id, changed: { birthday: null } }]);
    expect(await readMe(token)).toMatchObject({ name: 'Pip', critter: fox, birthday: null });
  });

  it('refuses what the contract refuses, and writes nothing', async () => {
    const told = watchFanOut();
    const { token, user } = await signInAnonymously();
    const refused: [unknown, string[]][] = [
      [{}, ['']],
      [{ name: '' }, ['name']],
      [{ name: 'x'.repeat(33) }, ['name']],
      [{ critter: { ...fox, species: 'dragon' } }, ['critter.species']],
      [{ birthday: '13-01' }, ['birthday']],
      [{ name: 'Pip', birthday: '2026-04-12' }, ['birthday']],
    ];
    for (const [body, fields] of refused) {
      const response = await patchProfile(token, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ error: { code: 'bad_request', fields } });
    }
    expect(told).toEqual([]);
    expect(await storedProfile(user.id)).toMatchObject({
      display_name: null,
      critter: null,
      birthday: null,
    });
  });

  it('keeps the change and the other farms when one fan-out fails, and logs it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    unregister.push(registerProfileFanOut(() => Promise.reject(new Error('farm unreachable'))));
    const told = watchFanOut();
    const { token, user } = await signInAnonymously();

    const response = await patchProfile(token, { name: 'Bea' });
    expect(response.status).toBe(200);
    expect(told).toEqual([{ person: user.id, changed: { name: 'Bea' } }]);
    expect((await readMe(token)).name).toBe('Bea');
    expect(errors).toHaveBeenCalledWith(
      'profile fan-out failed',
      expect.objectContaining({ person: user.id }),
    );
  });

  it('needs a session', async () => {
    expect((await patchProfile('no-such-session', { name: 'Pip' })).status).toBe(401);
  });
});
