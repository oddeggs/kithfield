import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchLetters } from '../src/auth/testing/client';
import { cottageOf } from '../src/cottage/stub';
import { api, cast, useTestPorts } from './farm/support/doubles';
import { askToDelete, confirmDeletion, emailPerson, letterTo } from './support/deletion';

beforeEach(() => {
  useTestPorts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the letter when a deletion is scheduled', () => {
  it('tells the person the day, in their language, and that signing in cancels it', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    await cottageOf(env, person.id).updateSettings({ lang: 'vi', timeZone: 'Asia/Ho_Chi_Minh' });
    const before = letters.sent().length;
    expect((await api(person, 'POST', '/v1/me/delete')).status).toBe(202);
    const letter = await letterTo(letters, email, before);
    expect(letter?.subject).toMatch(/^Tài khoản Kithfield của bạn sẽ bị xoá vào .*\d{4}/);
    expect(letter?.text).toContain('đăng nhập lại Kithfield');
  });

  it('writes one letter, apart from any code', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const before = letters.sent().length;
    await api(person, 'POST', '/v1/me/delete');
    await letterTo(letters, email, before);
    await new Promise((r) => setTimeout(r, 50));
    expect(
      letters
        .sent()
        .slice(before)
        .filter((l) => l.to === email),
    ).toHaveLength(1);
  });

  it('writes after a deletion confirmed on the website too', async () => {
    const letters = watchLetters();
    const { email } = await emailPerson(letters);
    let before = letters.sent().length;
    await askToDelete(email);
    await letterTo(letters, email, before);
    before = letters.sent().length;
    expect((await confirmDeletion(email, letters.codeFor(email))).status).toBe(202);
    const letter = await letterTo(letters, email, before);
    expect(letter?.subject).toMatch(/^Your Kithfield account will be deleted on /);
  });

  it('writes to nobody for an install that never signed in', async () => {
    const letters = watchLetters();
    const { pip } = await cast('pip');
    const before = letters.sent().length;
    expect((await api(pip, 'POST', '/v1/me/delete')).status).toBe(202);
    await new Promise((r) => setTimeout(r, 50));
    expect(letters.sent().slice(before)).toEqual([]);
  });
});
