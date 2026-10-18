import { MeSettings, PushJob } from '@kithfield/contracts';

import { readProfile, updateProfile } from './profile';

/*
 * Merging two people's cottages, when an anonymous person signs in to an account that already had
 * a person (`PersonMergedJob {from, into}`). The kept cottage (`into`) takes everything the other
 * (`from`) held, without duplicates, then `from` is emptied. Every step can run again safely.
 */

type Row = Record<string, SqlStorageValue>;

/** Everything person-keyed a cottage holds, as rows, for the kept cottage to take in. */
export interface CottageExport {
  readonly farms: Row[];
  readonly doorstep: Row[];
  readonly delivered: Row[];
  readonly devices: Row[];
  readonly seeds: Row[];
  readonly held: Row[];
  /** The person's settings, only if they ever set any. */
  readonly settings: MeSettings | null;
  /** Whether the app sent their time zone. */
  readonly zoneKnown: boolean;
}

const all = (sql: SqlStorage, table: string): Row[] => sql.exec(`SELECT * FROM ${table}`).toArray();

export function exportCottage(sql: SqlStorage): CottageExport {
  const stored = sql.exec('SELECT 1 FROM profile WHERE id = 1').toArray().length > 0;
  return {
    farms: all(sql, 'farms'),
    doorstep: all(sql, 'doorstep'),
    delivered: all(sql, 'delivered'),
    devices: all(sql, 'devices'),
    seeds: all(sql, 'seeds'),
    held: all(sql, 'held'),
    settings: stored ? readProfile(sql).settings : null,
    zoneKnown: stored && readProfile(sql).zoneKnown,
  };
}

/** Inserts rows that aren't there yet; a row already there (by its key) stays as it is. */
function insertMissing(sql: SqlStorage, table: string, rows: readonly Row[]): void {
  for (const row of rows) {
    const columns = Object.keys(row);
    sql.exec(
      `INSERT OR IGNORE INTO ${table} (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
      ...columns.map((c) => row[c] ?? null),
    );
  }
}

/**
 * Takes another cottage's rows into this one. Chat rows: the newer seq wins, the farm's facts fill
 * what is missing, a pin or mute from either stays, and the kept person's "Knock for" comes first.
 * Devices: the later registration wins, and a push token stays on one device only. Held pushes are
 * re-addressed to this person. Settings are taken only if this person never set any.
 */
export function mergeInto(sql: SqlStorage, data: CottageExport, person: string): void {
  for (const row of data.farms) {
    sql.exec(
      `INSERT INTO farms (farm, farm_kind, name, with_json, pinned, muted_until, seq, kind, actor,
         at, preview, for_you, knock_for) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (farm) DO UPDATE SET
         farm_kind = coalesce(farms.farm_kind, excluded.farm_kind),
         knock_for = coalesce(farms.knock_for, excluded.knock_for),
         name = coalesce(farms.name, excluded.name),
         with_json = coalesce(farms.with_json, excluded.with_json),
         pinned = max(farms.pinned, excluded.pinned),
         muted_until = max(coalesce(farms.muted_until, 0), coalesce(excluded.muted_until, 0)),
         seq = CASE WHEN coalesce(excluded.seq, -1) > coalesce(farms.seq, -1)
           THEN excluded.seq ELSE farms.seq END,
         kind = CASE WHEN coalesce(excluded.seq, -1) > coalesce(farms.seq, -1)
           THEN excluded.kind ELSE farms.kind END,
         actor = CASE WHEN coalesce(excluded.seq, -1) > coalesce(farms.seq, -1)
           THEN excluded.actor ELSE farms.actor END,
         at = CASE WHEN coalesce(excluded.seq, -1) > coalesce(farms.seq, -1)
           THEN excluded.at ELSE farms.at END,
         preview = CASE WHEN coalesce(excluded.seq, -1) > coalesce(farms.seq, -1)
           THEN excluded.preview ELSE farms.preview END,
         for_you = CASE WHEN coalesce(excluded.seq, -1) > coalesce(farms.seq, -1)
           THEN excluded.for_you ELSE farms.for_you END`,
      ...[
        'farm',
        'farm_kind',
        'name',
        'with_json',
        'pinned',
        'muted_until',
        'seq',
        'kind',
        'actor',
        'at',
        'preview',
        'for_you',
        'knock_for',
      ].map((c) => row[c] ?? null),
    );
  }
  sql.exec('UPDATE farms SET muted_until = NULL WHERE muted_until = 0');
  insertMissing(sql, 'doorstep', data.doorstep);
  insertMissing(sql, 'delivered', data.delivered);
  insertMissing(sql, 'seeds', data.seeds);

  for (const row of data.devices) {
    sql.exec(
      `INSERT INTO devices (device, platform, name, push_token, app_version, registered_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (device) DO UPDATE SET platform = excluded.platform, name = excluded.name,
         push_token = excluded.push_token, app_version = excluded.app_version,
         registered_at = excluded.registered_at
       WHERE excluded.registered_at > devices.registered_at`,
      ...['device', 'platform', 'name', 'push_token', 'app_version', 'registered_at'].map(
        (c) => row[c] ?? null,
      ),
    );
  }
  // One device keeps each push token: the one registered last.
  sql.exec(
    `UPDATE devices SET push_token = NULL WHERE push_token IS NOT NULL AND EXISTS (
       SELECT 1 FROM devices AS later WHERE later.push_token = devices.push_token
         AND (later.registered_at > devices.registered_at
           OR (later.registered_at = devices.registered_at AND later.device > devices.device)))`,
  );

  for (const row of data.held) {
    const raw = row['job'];
    if (typeof raw !== 'string') continue;
    const job = PushJob.parse(JSON.parse(raw));
    insertMissing(sql, 'held', [{ ...row, job: JSON.stringify({ ...job, person }) }]);
  }

  const stored = sql.exec('SELECT 1 FROM profile WHERE id = 1').toArray().length > 0;
  if (!stored && data.settings !== null) {
    const settings = MeSettings.parse(data.settings);
    updateProfile(sql, (profile) => ({ ...profile, settings, zoneKnown: data.zoneKnown }));
  }
}

/**
 * Moves the merged person's action keys in D1 to the kept person. A device both held keeps the
 * kept person's key. Running it again changes nothing.
 */
export async function moveActionKeys(db: D1Database, from: string, into: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `DELETE FROM device_action_keys WHERE person_id = ? AND device_id IN
           (SELECT device_id FROM device_action_keys WHERE person_id = ?)`,
      )
      .bind(from, into),
    db.prepare('UPDATE device_action_keys SET person_id = ? WHERE person_id = ?').bind(into, from),
  ]);
}
