import { DeleteAccountResponse, ErrorBody, Me, PROTOCOL_VERSION } from '@kithfield/contracts';
import { exports, env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETION_GRACE_MS } from '../src/auth/me';
import {
  call,
  readSignIn,
  sendCode,
  sessionOf,
  signInWithCode,
  watchLetters,
} from '../src/auth/testing/client';
import { TestSocket } from './farm/support/client';
import { api, cast, critter, type Person, plantFarm, useTestPorts } from './farm/support/doubles';

beforeEach(() => {
  useTestPorts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Someone who signs in with an email code, with a name and critter. */
async function emailPerson(letters: ReturnType<typeof watchLetters>) {
  const email = `leaving.${crypto.randomUUID().slice(0, 8)}@example.com`;
  await sendCode(email);
  const signedIn = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
  const person: Person = {
    id: signedIn.user.id,
    token: signedIn.token,
    name: 'Wren',
    critter: critter('owl'),
  };
  const set = await api(person, 'PATCH', '/v1/me/profile', {
    name: person.name,
    critter: person.critter,
  });
  expect(set.status).toBe(200);
  return { email, person };
}

const deletedAt = (person: string) =>
  env.DB.prepare('SELECT deleted_at FROM people WHERE id = ?')
    .bind(person)
    .first<{ deleted_at: number | null }>();

/** The person's cottage socket, said hello to with a real socket token. */
async function cottageSocket(person: Person) {
  const token = await api(person, 'POST', '/v1/rt-token', {});
  const response = await exports.default.fetch(
    `https://dev.kithfield.com/api/v1/cottage/${person.id}/socket`,
    { headers: { Upgrade: 'websocket' } },
  );
  const ws = response.webSocket;
  if (ws === null) throw new Error('No socket');
  const heard: string[] = [];
  let closed = false;
  ws.addEventListener('message', (e) => heard.push(String(e.data)));
  ws.addEventListener('close', () => {
    closed = true;
  });
  ws.accept();
  ws.send(
    JSON.stringify({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      token: (token.body as { token: string }).token,
    }),
  );
  const waitFor = async (check: () => boolean) => {
    for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
    return check();
  };
  expect(await waitFor(() => heard.length > 0)).toBe(true);
  return { heard, closedSoon: () => waitFor(() => closed) };
}

describe('deleting an account in the app', () => {
  it('starts the 30 days, ends every session and closes every socket', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const second = await readSignIn(
      await call('/auth/sign-in/anonymous', { body: {} }), // another person's device stays signed in
    );
    const farmSocket = await TestSocket.open(farm);
    await farmSocket.hello(fig, farm);
    const cottage = await cottageSocket(fig);

    const before = Date.now();
    const answer = await api(fig, 'POST', '/v1/me/delete');
    expect(answer.status).toBe(202);
    const { purgeAt } = DeleteAccountResponse.parse(answer.body);
    const marked = (await deletedAt(fig.id))?.deleted_at ?? 0;
    expect(marked).toBeGreaterThanOrEqual(before);
    expect(purgeAt).toBe(marked + DELETION_GRACE_MS);

    expect(await sessionOf(fig.token)).toBeNull();
    expect((await api(fig, 'GET', '/v1/me')).status).toBe(401);
    expect(await sessionOf(second.token)).not.toBeNull();
    expect((await farmSocket.next('error')).code).toBe('unauthorized');
    expect(await cottage.closedSoon()).toBe(true);
    // Friends still see them until the purge.
    expect((await api(pip, 'GET', '/v1/farms')).status).toBe(200);
  });

  it('keeps the first purge time when asked twice, and lets signing in again cancel it', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const first = DeleteAccountResponse.parse((await api(person, 'POST', '/v1/me/delete')).body);
    await sendCode(email);
    const back = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
    const me = Me.parse((await api({ ...person, token: back.token }, 'GET', '/v1/me')).body);
    expect(me.purgeAt).toBeNull();
    expect(first.purgeAt).toBeGreaterThan(Date.now());

    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(Date.now() - 1000, person.id)
      .run();
    const again = DeleteAccountResponse.parse(
      (await api({ ...person, token: back.token }, 'POST', '/v1/me/delete')).body,
    );
    expect(again.purgeAt).toBe(((await deletedAt(person.id))?.deleted_at ?? 0) + DELETION_GRACE_MS);
    expect(again.purgeAt).toBeLessThan(Date.now() + DELETION_GRACE_MS);
  });

  it('turns away signing in once the 30 days are over', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
      .bind(Date.now() - DELETION_GRACE_MS - 1000, person.id)
      .run();
    await sendCode(email);
    const refused = await signInWithCode(email, letters.codeFor(email));
    expect(refused.status).toBe(403);
    expect((await deletedAt(person.id))?.deleted_at).not.toBeNull();
  });

  it('needs a session', async () => {
    expect((await api(null, 'POST', '/v1/me/delete')).status).toBe(401);
  });
});

describe('deleting an account from the website', () => {
  const ask = (email: string, ip = `10.8.${Math.floor(Math.random() * 250)}.1`) =>
    call('/v1/deletion-requests', { body: { email, lang: 'vi' }, ip });
  /** The letter goes after the answer: waits for it to reach the address. */
  const letterTo = async (letters: ReturnType<typeof watchLetters>, address: string, after = 0) => {
    for (let i = 0; i < 200; i++) {
      const letter = letters
        .sent()
        .slice(after)
        .find((l) => l.to === address);
      if (letter !== undefined) return letter;
      await new Promise((r) => setTimeout(r, 5));
    }
    return null;
  };
  const confirm = (email: string, code: string) =>
    call('/v1/deletion-requests/confirm', { body: { email, code } });

  it('answers the same for any address, and sends a code only to one with an account', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const before = letters.sent().length;
    expect((await ask('nobody.here@example.com')).status).toBe(202);
    expect((await ask(email.toUpperCase())).status).toBe(202);
    const letter = await letterTo(letters, email, before);
    expect(
      letters
        .sent()
        .slice(before)
        .map((l) => l.to),
    ).toEqual([email]);
    expect(letter?.subject).toMatch(/^Mã Kithfield để xoá tài khoản của bạn: \d{6}$/);

    const answer = await confirm(email, letters.codeFor(email));
    expect(answer.status).toBe(202);
    const { purgeAt } = DeleteAccountResponse.parse(await answer.json());
    expect(purgeAt).toBe(((await deletedAt(person.id))?.deleted_at ?? 0) + DELETION_GRACE_MS);
    expect(await sessionOf(person.token)).toBeNull();
    // Spent: the same code doesn't work twice.
    const reused = await confirm(email, letters.codeFor(email));
    expect(ErrorBody.parse(await reused.json()).error.code).toBe('code_invalid');
  });

  it('answers code_invalid alike for a wrong code, no code and no account, and spends a code after five tries', async () => {
    const letters = watchLetters();
    const { email, person } = await emailPerson(letters);
    const invalid = async (address: string, code: string) => {
      const response = await confirm(address, code);
      expect(response.status).toBe(400);
      return ErrorBody.parse(await response.json()).error.code;
    };
    expect(await invalid('nobody.here@example.com', '123456')).toBe('code_invalid');
    expect(await invalid(email, '123456')).toBe('code_invalid');
    const before = letters.sent().length;
    await ask(email);
    await letterTo(letters, email, before);
    const code = letters.codeFor(email);
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect(await invalid(email, wrong)).toBe('code_invalid');
    expect(await invalid(email, code)).toBe('code_invalid');
    expect((await deletedAt(person.id))?.deleted_at).toBeNull();
  });

  it('turns away a code older than ten minutes', async () => {
    const letters = watchLetters();
    const { email } = await emailPerson(letters);
    const before = letters.sent().length;
    await ask(email);
    await letterTo(letters, email, before);
    await env.DB.prepare('UPDATE deletion_codes SET expires_at = ?')
      .bind(Date.now() - 1)
      .run();
    expect((await confirm(email, letters.codeFor(email))).status).toBe(400);
  });

  it('turns down a malformed request and limits requests from one address', async () => {
    const bad = await call('/v1/deletion-requests', { body: { email: 'nope', lang: 'fr' } });
    expect(ErrorBody.parse(await bad.json()).error).toEqual({
      code: 'bad_request',
      fields: ['email', 'lang'],
    });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await ask(`x${i}@example.com`, '10.7.7.7')).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });
});
