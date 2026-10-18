import { ErrorBody } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addressHash, CODE_FAILURES_PER_ADDRESS } from '../src/auth/email-code';
import { watchLetters } from '../src/auth/testing/client';
import { useTestPorts } from './farm/support/doubles';
import {
  askToDelete,
  confirmDeletion,
  deletedAt,
  emailPerson,
  letterTo,
  type Letters,
} from './support/deletion';

beforeEach(() => {
  useTestPorts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const failuresOf = async (email: string) =>
  (
    await env.DB.prepare('SELECT count(*) AS n FROM email_code_failures WHERE address_hash = ?')
      .bind(await addressHash(email))
      .first<{ n: number }>()
  )?.n ?? 0;

/** Locks the address the way too many wrong sign-in codes in a day do. */
const lock = async (email: string) => {
  const hash = await addressHash(email);
  for (let i = 0; i < CODE_FAILURES_PER_ADDRESS; i++) {
    await env.DB.prepare('INSERT INTO email_code_failures (address_hash, failed_at) VALUES (?, ?)')
      .bind(hash, Date.now())
      .run();
  }
};

/** Asks for a code and reads it from the letter. */
const codeFor = async (letters: Letters, email: string) => {
  const before = letters.sent().length;
  expect((await askToDelete(email)).status).toBe(202);
  await letterTo(letters, email, before);
  return letters.codeFor(email);
};

const wrongFor = (code: string) => (code === '000000' ? '000001' : '000000');

const invalid = async (email: string, code: string) => {
  const response = await confirmDeletion(email, code);
  expect(response.status).toBe(400);
  return ErrorBody.parse(await response.json()).error.code;
};

describe('guessing deletion codes', () => {
  it('counts each wrong code against the address’s daily lock, and a right one clears it', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const code = await codeFor(letters, email);
    expect(await invalid(email, wrongFor(code))).toBe('code_invalid');
    expect(await invalid(email, wrongFor(code))).toBe('code_invalid');
    expect(await failuresOf(email)).toBe(2);
    expect((await confirmDeletion(email, code)).status).toBe(202);
    expect(await failuresOf(email)).toBe(0);
    expect((await deletedAt(person.id))?.deleted_at).not.toBeNull();
  });

  it('never counts guesses at an address with no code waiting, so strangers can’t lock it', async () => {
    const letters = watchLetters();
    const { email } = await emailPerson(letters);
    for (let i = 0; i < 3; i++) expect(await invalid(email, '123456')).toBe('code_invalid');
    expect(await failuresOf(email)).toBe(0);
  });

  it('takes no code from a locked address, and sends it none', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const code = await codeFor(letters, email);
    await lock(email);
    expect(await invalid(email, code)).toBe('code_invalid');
    expect((await deletedAt(person.id))?.deleted_at).toBeNull();

    const before = letters.sent().length;
    expect((await askToDelete(email)).status).toBe(202);
    await new Promise((r) => setTimeout(r, 100));
    expect(letters.sent().slice(before)).toEqual([]);
  });

  it('spends a try for every guess, however many arrive at once', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const code = await codeFor(letters, email);
    const wrong = Array.from({ length: 12 }, (_, i) => String(i).padStart(6, '0')).filter(
      (c) => c !== code,
    );
    const answers = await Promise.all(wrong.map((c) => confirmDeletion(email, c)));
    expect(answers.every((a) => a.status === 400)).toBe(true);
    expect(await invalid(email, code)).toBe('code_invalid');
    expect((await deletedAt(person.id))?.deleted_at).toBeNull();
  });
});
