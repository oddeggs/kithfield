import { Critter, DisplayName, MonthDay, type Me, type SignInMethod } from '@kithfield/contracts';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';

/** A pending account deletion waits this long; signing in again within it cancels it. */
export const DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

interface MeRow {
  display_name: string | null;
  critter: string | null;
  birthday: string | null;
  age_ok: number | null;
  terms_version: string | null;
  deleted_at: number | null;
}

/** Identity rows by provider, as `accounts.provider_id` names them. */
const METHOD_OF_PROVIDER: Readonly<Record<string, SignInMethod>> = {
  apple: 'apple',
  google: 'google',
  'email-otp': 'email',
};

/** A stored critter that no longer fits its schema reads as unset, never as a broken `Me`. */
function critterOf(json: string | null): Critter | null {
  if (json === null) return null;
  try {
    const parsed = Critter.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function birthdayOf(birthday: string | null): string | null {
  const parsed = MonthDay.safeParse(birthday);
  return parsed.success ? parsed.data : null;
}

function nameOf(name: string | null): string | null {
  const parsed = DisplayName.safeParse(name);
  return parsed.success ? parsed.data : null;
}

/**
 * `GET /v1/me`: the person from D1 (name, critter, birthday, sign-in methods, age and Terms, a pending
 * deletion) with their settings and hibernating from their cottage. Null when the person is gone.
 */
export async function readMe(env: Bindings, person: string): Promise<Me | null> {
  const row = await env.DB.prepare(
    'SELECT display_name, critter, birthday, age_ok, terms_version, deleted_at FROM people WHERE id = ?',
  )
    .bind(person)
    .first<MeRow>();
  // A person who is gone gets no cottage woken for them.
  if (row === null) return null;
  const [methods, cottage] = await Promise.all([
    env.DB.prepare('SELECT DISTINCT provider_id FROM accounts WHERE person_id = ?')
      .bind(person)
      .all<{ provider_id: string }>(),
    cottageOf(env, person).settings(),
  ]);
  const signIn = [
    ...new Set(methods.results.flatMap(({ provider_id }) => METHOD_OF_PROVIDER[provider_id] ?? [])),
  ].sort();
  return {
    person,
    name: nameOf(row.display_name),
    critter: critterOf(row.critter),
    birthday: birthdayOf(row.birthday),
    signIn,
    ageOk: row.age_ok === 1,
    termsVersion: row.terms_version,
    hibernating: cottage.hibernating,
    settings: cottage.settings,
    purgeAt: row.deleted_at === null ? null : row.deleted_at + DELETION_GRACE_MS,
  };
}
