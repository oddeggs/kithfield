import { getMigrations } from 'better-auth/db/migration';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { buildAuthOptions } from './options';

describe('the D1 schema', () => {
  it('has every table and column Better Auth expects, by its own migrator', async () => {
    const options = buildAuthOptions({
      db: env.DB,
      secret: 'schema-check-secret-schema-check-secret',
      baseURL: 'https://dev.kithfield.com',
      trustedOrigins: [],
      appleBundleIds: ['com.kithfield.app.dev', 'com.kithfield.app'],
      googleClientIds: ['google-client'],
      sendCode: () => Promise.resolve(),
    });
    const { toBeCreated, toBeAdded } = await getMigrations(options);
    expect(toBeCreated.map((table) => table.table)).toEqual([]);
    expect(toBeAdded.map((table) => [table.table, Object.keys(table.fields)])).toEqual([]);
  });

  it('cascades a deleted person to their sessions and identities', async () => {
    const person = `p-${crypto.randomUUID()}`;
    const at = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO people (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, '', ?, 1, ?, ?)`,
      ).bind(person, `${person}@example.com`, at, at),
      env.DB.prepare(
        `INSERT INTO sessions (id, expires_at, token, created_at, updated_at, person_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`s-${person}`, at, `t-${person}`, at, at, person),
      env.DB.prepare(
        `INSERT INTO accounts (id, account_id, provider_id, person_id, created_at, updated_at)
         VALUES (?, ?, 'apple', ?, ?, ?)`,
      ).bind(`a-${person}`, `sub-${person}`, person, at, at),
    ]);

    await env.DB.prepare('DELETE FROM people WHERE id = ?').bind(person).run();

    const left = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM sessions WHERE person_id = ?1)
            + (SELECT COUNT(*) FROM accounts WHERE person_id = ?1) AS n`,
    )
      .bind(person)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
