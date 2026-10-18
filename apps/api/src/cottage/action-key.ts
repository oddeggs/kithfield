import { RegisterDeviceResponse } from '@kithfield/contracts';
import type { MiddlewareHandler } from 'hono';

import type { Bindings } from '../env';

/**
 * Device action keys: the share extension and notification replies call the API without the
 * app's session, sending the device's key in this header. Only its SHA-256 is stored, in D1, so
 * any Worker can check it; registering the device again rotates it.
 */
export const ACTION_KEY_HEADER = 'Kithfield-Action-Key';

/** Who an action key speaks for, set by `requireActionKey`. */
export type ActionKeyVariables = { actionPerson: string; actionDevice: string };

/** 32 random bytes, base64url: 43 characters. */
export function newActionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function hashActionKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores a device's new key, replacing its old one. A device id that belonged to someone else
 * (the phone signed in as another person) leaves them: their rows are removed and their ids
 * returned, so the caller can tell their cottages to forget the device.
 */
export async function storeActionKey(
  db: D1Database,
  person: string,
  device: string,
  key: string,
  now: number,
): Promise<string[]> {
  const previous = await db
    .prepare(
      'SELECT person_id AS person FROM device_action_keys WHERE device_id = ? AND person_id <> ?',
    )
    .bind(device, person)
    .all<{ person: string }>();
  await db.batch([
    db
      .prepare('DELETE FROM device_action_keys WHERE device_id = ? AND person_id <> ?')
      .bind(device, person),
    db
      .prepare(
        `INSERT INTO device_action_keys (key_hash, person_id, device_id, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (person_id, device_id) DO UPDATE SET key_hash = excluded.key_hash,
           created_at = excluded.created_at`,
      )
      .bind(await hashActionKey(key), person, device, now),
  ]);
  return previous.results.map((row) => row.person);
}

/** Revokes a device's key, as when the device is signed out. */
export async function revokeActionKey(
  db: D1Database,
  person: string,
  device: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM device_action_keys WHERE person_id = ? AND device_id = ?')
    .bind(person, device)
    .run();
}

const keyShape = RegisterDeviceResponse.shape.actionKey;

/**
 * Lets a request through only with a live action key, and names its person and device in
 * `actionPerson` and `actionDevice`. Anything else is `401 unauthorized`.
 */
export function requireActionKey(): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: ActionKeyVariables;
}> {
  return async (c, next) => {
    const key = c.req.header(ACTION_KEY_HEADER);
    const found =
      key !== undefined && keyShape.safeParse(key).success
        ? await c.env.DB.prepare(
            'SELECT person_id AS person, device_id AS device FROM device_action_keys WHERE key_hash = ?',
          )
            .bind(await hashActionKey(key))
            .first<{ person: string; device: string }>()
        : null;
    if (found === null) return c.json({ error: { code: 'unauthorized' } }, 401);
    c.set('actionPerson', found.person);
    c.set('actionDevice', found.device);
    await next();
    return undefined;
  };
}
