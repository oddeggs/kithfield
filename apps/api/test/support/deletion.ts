import { env } from 'cloudflare:workers';
import { expect } from 'vitest';

import {
  call,
  readSignIn,
  sendCode,
  signInWithCode,
  type watchLetters,
} from '../../src/auth/testing/client';
import { api, critter, type Person } from '../farm/support/doubles';

/* Shared by the account deletion tests: people with an email, and the website's two steps. */

export type Letters = ReturnType<typeof watchLetters>;

/** Someone who signs in with an email code, past the age check, with a name and critter. */
export async function emailPerson(letters: Letters) {
  const email = `leaving.${crypto.randomUUID().slice(0, 8)}@example.com`;
  await sendCode(email);
  const signedIn = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
  const person: Person = {
    id: signedIn.user.id,
    token: signedIn.token,
    name: 'Wren',
    critter: critter('owl'),
  };
  const aged = await api(person, 'POST', '/v1/me/age', { birthYear: 1990, country: 'GB' });
  expect(aged.status).toBe(204);
  const set = await api(person, 'PATCH', '/v1/me/profile', {
    name: person.name,
    critter: person.critter,
  });
  expect(set.status).toBe(200);
  return { email, person };
}

export const deletedAt = (person: string) =>
  env.DB.prepare('SELECT deleted_at FROM people WHERE id = ?')
    .bind(person)
    .first<{ deleted_at: number | null }>();

/** `POST /v1/deletion-requests`, from its own client address unless one is given. */
export const askToDelete = (email: string, ip = `10.8.${Math.floor(Math.random() * 250)}.1`) =>
  call('/v1/deletion-requests', { body: { email, lang: 'vi' }, ip });

export const confirmDeletion = (email: string, code: string) =>
  call('/v1/deletion-requests/confirm', { body: { email, code } });

/** Letters go after the answer: waits for one to reach the address, sent after `after` others. */
export async function letterTo(letters: Letters, address: string, after = 0) {
  for (let i = 0; i < 200; i++) {
    const letter = letters
      .sent()
      .slice(after)
      .find((l) => l.to === address);
    if (letter !== undefined) return letter;
    await new Promise((r) => setTimeout(r, 5));
  }
  return null;
}
