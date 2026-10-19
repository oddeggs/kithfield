import { type DeviceList, Platform } from '@kithfield/contracts';

import { registerSignOutStep } from '../auth';
import type { Bindings } from '../env';
import { farmStub } from '../farm/http';
import { cottageOf } from './stub';

/*
 * The person's signed-in devices (`GET /v1/devices`, `DELETE /v1/devices/:id`). A device is the id
 * the app makes on first launch and registers with `PUT /v1/devices/:deviceId`; the session that
 * registered it is tied to it in `session_devices`, so one id names both the push target and the
 * sign-in to end.
 */

const DAY_MS = 24 * 60 * 60_000;
const MAX_DEVICES = 50;

/** Ties the session to the device it registered, with the name and platform the app gave. */
export async function linkSession(
  db: D1Database,
  input: {
    session: string;
    person: string;
    device: string;
    name: string;
    platform: string;
    city: string | null;
    at: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO session_devices (session_id, person_id, device_id, name, platform, city, registered_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?1)
       ON CONFLICT (session_id) DO UPDATE SET device_id = excluded.device_id, name = excluded.name,
         platform = excluded.platform, city = COALESCE(excluded.city, session_devices.city),
         registered_at = excluded.registered_at`,
    )
    .bind(
      input.session,
      input.person,
      input.device,
      input.name,
      input.platform,
      input.city,
      input.at,
    )
    .run();
}

type Row = {
  session: string;
  updated_at: string | number;
  device_id: string;
  name: string;
  platform: string;
  city: string | null;
};

const millis = (at: string | number): number =>
  typeof at === 'number' ? at : Date.parse(String(at));

/**
 * The person's devices with a live session, most recently active first. Last active is the day it
 * was (UTC midnight), never the time; the city is all that is said of where.
 */
export async function listDevices(
  db: D1Database,
  person: string,
  current: string,
  now: number,
): Promise<DeviceList> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS session, s.updated_at, d.device_id, d.name, d.platform, d.city
       FROM sessions s JOIN session_devices d ON d.session_id = s.id
       WHERE s.person_id = ? AND s.expires_at > ?`,
    )
    .bind(person, new Date(now).toISOString())
    .all<Row>();
  const byDevice = new Map<string, DeviceList['devices'][number]>();
  for (const row of results) {
    const platform = Platform.safeParse(row.platform);
    const at = millis(row.updated_at);
    if (!platform.success || !Number.isFinite(at)) continue;
    const day = Math.floor(at / DAY_MS) * DAY_MS;
    const seen = byDevice.get(row.device_id);
    const isCurrent = row.session === current || seen?.current === true;
    if (seen === undefined || day > seen.lastActiveAt) {
      byDevice.set(row.device_id, {
        device: row.device_id,
        name: row.name.slice(0, 64),
        platform: platform.data,
        city: row.city === null || row.city.trim() === '' ? null : row.city.slice(0, 80),
        lastActiveAt: day,
        current: isCurrent,
      });
    } else if (isCurrent) {
      byDevice.set(row.device_id, { ...seen, current: true });
    }
  }
  const devices = [...byDevice.values()]
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt - a.lastActiveAt)
    .slice(0, MAX_DEVICES);
  return { devices };
}

/**
 * Signs a device out: its sessions end, it gets no more pushes, its action key stops working, and
 * every socket it holds closes with `error {session_ended}`. False when the person has no such
 * device signed in.
 */
export async function signOutDevice(
  env: Bindings,
  person: string,
  device: string,
): Promise<boolean> {
  const { results } = await env.DB.prepare(
    'SELECT session_id FROM session_devices WHERE person_id = ? AND device_id = ?',
  )
    .bind(person, device)
    .all<{ session_id: string }>();
  const sessions = results.map((r) => r.session_id);
  if (sessions.length === 0) return false;
  await env.DB.batch([
    ...sessions.map((id) =>
      env.DB.prepare('DELETE FROM sessions WHERE id = ? AND person_id = ?').bind(id, person),
    ),
    env.DB.prepare('DELETE FROM device_action_keys WHERE person_id = ? AND device_id = ?').bind(
      person,
      device,
    ),
  ]);
  const cottage = cottageOf(env, person);
  await cottage.forgetDevice(device);
  const { results: farms } = await env.DB.prepare(
    'SELECT farm_id FROM memberships WHERE person_id = ? AND left_at IS NULL',
  )
    .bind(person)
    .all<{ farm_id: string }>();
  await Promise.all(
    sessions.flatMap((session) => [
      cottage.closeSession(session),
      ...farms.map(({ farm_id }) => farmStub(env, farm_id).closeSession(session)),
    ]),
  );
  return true;
}

/** A phone signing itself out signs its device out: the same as ending it from another device. */
registerSignOutStep(async (env, person, session) => {
  const row = await env.DB.prepare(
    'SELECT device_id FROM session_devices WHERE session_id = ? AND person_id = ?',
  )
    .bind(session, person)
    .first<{ device_id: string }>();
  if (row !== null) await signOutDevice(env, person, row.device_id);
});
