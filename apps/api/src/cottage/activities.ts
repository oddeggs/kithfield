import type { ActivityTokenRequest } from '@kithfield/contracts';

/*
 * Live Activity push tokens, per device: the push-to-start token (one per device), and the update
 * token of each activity running on it (the day of a plan, or the fire). They go with the device.
 */

/** A running activity's update token, as the cottage keeps it. `seed` is null for the fire. */
export interface ActivityToken {
  readonly device: string;
  readonly activity: 'plan_day' | 'fire';
  readonly farm: string;
  readonly seed: number | null;
  readonly token: string;
}

/** Which activity, without its token: what `DELETE …/activities` names. */
export type ActivityKey =
  | { readonly activity: 'plan_day'; readonly farm: string; readonly seed: number }
  | { readonly activity: 'fire'; readonly farm: string };

/** The fire has no seed; the key column holds 0 for it, as SQLite primary keys can't be null. */
const seedColumn = (key: ActivityKey) => (key.activity === 'plan_day' ? key.seed : 0);

export function setStartToken(sql: SqlStorage, device: string, token: string, now: number): void {
  sql.exec(
    `INSERT INTO activity_start_tokens (device, token, at) VALUES (?, ?, ?)
     ON CONFLICT (device) DO UPDATE SET token = excluded.token, at = excluded.at`,
    device,
    token,
    now,
  );
}

export function startTokens(sql: SqlStorage): { device: string; token: string }[] {
  return sql
    .exec<{ device: string; token: string }>('SELECT device, token FROM activity_start_tokens')
    .toArray();
}

export function setActivityToken(
  sql: SqlStorage,
  device: string,
  request: ActivityTokenRequest,
  now: number,
): void {
  sql.exec(
    `INSERT INTO activity_tokens (device, activity, farm, seed, token, at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (device, activity, farm, seed) DO UPDATE SET token = excluded.token, at = excluded.at`,
    device,
    request.activity,
    request.farm,
    seedColumn(request),
    request.token,
    now,
  );
}

export function dropActivityToken(sql: SqlStorage, device: string, key: ActivityKey): boolean {
  return (
    sql.exec(
      'DELETE FROM activity_tokens WHERE device = ? AND activity = ? AND farm = ? AND seed = ?',
      device,
      key.activity,
      key.farm,
      seedColumn(key),
    ).rowsWritten > 0
  );
}

/** Every device's token for one activity: a plan's day on a farm, or the farm's fire. */
export function activityTokens(sql: SqlStorage, key: ActivityKey): ActivityToken[] {
  return sql
    .exec<{ device: string; token: string }>(
      'SELECT device, token FROM activity_tokens WHERE activity = ? AND farm = ? AND seed = ?',
      key.activity,
      key.farm,
      seedColumn(key),
    )
    .toArray()
    .map(({ device, token }) => ({
      device,
      activity: key.activity,
      farm: key.farm,
      seed: key.activity === 'plan_day' ? key.seed : null,
      token,
    }));
}

/** The plans whose day this person follows on a farm, by seed. */
export function followedSeeds(sql: SqlStorage, farm: string): number[] {
  return sql
    .exec<{ seed: number }>(
      "SELECT DISTINCT seed FROM activity_tokens WHERE activity = 'plan_day' AND farm = ?",
      farm,
    )
    .toArray()
    .map((row) => row.seed);
}

/** A token APNs no longer takes (`410`, or a bad token): that one token goes. */
export function dropDeadToken(sql: SqlStorage, token: string): void {
  sql.exec('DELETE FROM activity_tokens WHERE token = ?', token);
  sql.exec('DELETE FROM activity_start_tokens WHERE token = ?', token);
}

/** The device signed out or was forgotten: its tokens go with it. */
export function forgetDeviceActivities(sql: SqlStorage, device: string): void {
  sql.exec('DELETE FROM activity_tokens WHERE device = ?', device);
  sql.exec('DELETE FROM activity_start_tokens WHERE device = ?', device);
}

/** Whether the device is one of the person's, as registered with `PUT /v1/devices/:id`. */
export function hasDevice(sql: SqlStorage, device: string): boolean {
  return sql.exec('SELECT 1 FROM devices WHERE device = ?', device).toArray().length > 0;
}
