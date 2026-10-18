import type { Platform, RegisterDeviceRequest } from '@kithfield/contracts';

/** A device the person signed in on, as the cottage keeps it. */
export interface CottageDevice {
  readonly device: string;
  readonly platform: Platform;
  readonly name: string;
  readonly pushToken: string | null;
  readonly appVersion: string;
  readonly registeredAt: number;
}

/** Where a push goes: one device's Expo push token. */
export interface PushTarget {
  readonly device: string;
  readonly token: string;
}

/**
 * Registers a device or updates it. A push token moves with the phone: if another of the
 * person's devices held the same token, it no longer does.
 */
export function registerDevice(
  sql: SqlStorage,
  device: string,
  request: RegisterDeviceRequest,
  now: number,
): void {
  if (request.pushToken !== null) {
    sql.exec(
      'UPDATE devices SET push_token = NULL WHERE push_token = ? AND device <> ?',
      request.pushToken,
      device,
    );
  }
  sql.exec(
    `INSERT INTO devices (device, platform, name, push_token, app_version, registered_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (device) DO UPDATE SET platform = excluded.platform, name = excluded.name,
       push_token = excluded.push_token, app_version = excluded.app_version,
       registered_at = excluded.registered_at`,
    device,
    request.platform,
    request.name,
    request.pushToken,
    request.appVersion,
    now,
  );
}

export function listDevices(sql: SqlStorage): CottageDevice[] {
  return sql
    .exec<{
      device: string;
      platform: Platform;
      name: string;
      push_token: string | null;
      app_version: string;
      registered_at: number;
    }>('SELECT * FROM devices ORDER BY registered_at DESC')
    .toArray()
    .map((row) => ({
      device: row.device,
      platform: row.platform,
      name: row.name,
      pushToken: row.push_token,
      appVersion: row.app_version,
      registeredAt: row.registered_at,
    }));
}

export function forgetDevice(sql: SqlStorage, device: string): void {
  sql.exec('DELETE FROM devices WHERE device = ?', device);
}

/**
 * Stops pushing to a token Expo says is no longer registered. Only that exact token is dropped:
 * if the device has registered a new one since, it stays.
 */
export function dropPushToken(sql: SqlStorage, device: string, token: string): boolean {
  const cursor = sql.exec(
    'UPDATE devices SET push_token = NULL WHERE device = ? AND push_token = ?',
    device,
    token,
  );
  return cursor.rowsWritten > 0;
}

export function pushTargets(sql: SqlStorage): PushTarget[] {
  return sql
    .exec<{ device: string; token: string }>(
      'SELECT device, push_token AS token FROM devices WHERE push_token IS NOT NULL',
    )
    .toArray();
}
