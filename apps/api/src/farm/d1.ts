import {
  Critter,
  type FarmId,
  type FarmKind,
  type PersonId,
  type Role,
} from '@kithfield/contracts';

import type { Profile } from './ports';

/*
 * The global farm tables in D1: farms, memberships, invites and the waiting list. The farm object
 * writes farms and memberships as it commits `farm_created`, `joined`, `left`, `removed` and role
 * changes, so D1 always follows the log.
 */

export type FarmRow = {
  id: FarmId;
  kind: FarmKind;
  name: string | null;
  land: string;
  size_cap: number;
};

export const farmRow = (db: D1Database, farm: FarmId): Promise<FarmRow | null> =>
  db
    .prepare('SELECT id, kind, name, land, size_cap FROM farms WHERE id = ?')
    .bind(farm)
    .first<FarmRow>();

/** Adds the farm's row; false when it (or a visit between the same two people) is already there. */
export const insertFarm = async (
  db: D1Database,
  row: {
    id: FarmId;
    kind: FarmKind;
    name: string | null;
    land: string;
    keeper: PersonId | null;
    pair: string | null;
    at: number;
  },
): Promise<boolean> => {
  const result = await db
    .prepare(
      'INSERT OR IGNORE INTO farms (id, kind, name, land, keeper_id, created_at, pair) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(row.id, row.kind, row.name, row.land, row.keeper, row.at, row.pair)
    .run();
  return result.meta.changes > 0;
};

export const updateFarm = async (
  db: D1Database,
  farm: FarmId,
  set: { name?: string; land?: string; keeper?: PersonId },
) => {
  const statements = [];
  if (set.name !== undefined)
    statements.push(db.prepare('UPDATE farms SET name = ? WHERE id = ?').bind(set.name, farm));
  if (set.land !== undefined)
    statements.push(db.prepare('UPDATE farms SET land = ? WHERE id = ?').bind(set.land, farm));
  if (set.keeper !== undefined) {
    statements.push(
      db.prepare('UPDATE farms SET keeper_id = ? WHERE id = ?').bind(set.keeper, farm),
    );
  }
  if (statements.length > 0) await db.batch(statements);
};

/** The visit between two people, if they have one. */
export const visitBetween = (db: D1Database, pair: string): Promise<{ id: FarmId } | null> =>
  db
    .prepare("SELECT id FROM farms WHERE kind = 'visit' AND pair = ?")
    .bind(pair)
    .first<{ id: FarmId }>();

/** The person's role on the farm while they live there; null otherwise. */
export const roleOf = async (
  db: D1Database,
  farm: FarmId,
  person: PersonId,
): Promise<Role | null> => {
  const row = await db
    .prepare('SELECT role FROM memberships WHERE farm_id = ? AND person_id = ? AND left_at IS NULL')
    .bind(farm, person)
    .first<{ role: Role }>();
  return row?.role ?? null;
};

export const upsertMembership = async (
  db: D1Database,
  farm: FarmId,
  person: PersonId,
  role: Role,
  at: number,
) => {
  await db
    .prepare(
      `INSERT INTO memberships (person_id, farm_id, role, joined_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (person_id, farm_id) DO UPDATE SET role = excluded.role, joined_at = excluded.joined_at, left_at = NULL`,
    )
    .bind(person, farm, role, at)
    .run();
};

export const endMembership = async (db: D1Database, farm: FarmId, person: PersonId, at: number) => {
  await db
    .prepare(
      'UPDATE memberships SET left_at = ? WHERE farm_id = ? AND person_id = ? AND left_at IS NULL',
    )
    .bind(at, farm, person)
    .run();
};

export const setRole = async (db: D1Database, farm: FarmId, person: PersonId, role: Role) => {
  await db
    .prepare('UPDATE memberships SET role = ? WHERE farm_id = ? AND person_id = ?')
    .bind(role, farm, person)
    .run();
};

/* Invites: only a hash of the code is kept. A new invite retires the farm's old ones. */

export type InviteRow = { farm_id: FarmId; expires_at: number | null; uses_left: number | null };

export const replaceInvite = async (
  db: D1Database,
  invite: { hash: string; farm: FarmId; by: PersonId; expiresAt: number | null },
) => {
  await db.batch([
    db.prepare('DELETE FROM invites WHERE farm_id = ?').bind(invite.farm),
    db
      .prepare(
        'INSERT INTO invites (code_hash, farm_id, created_by, expires_at, uses_left) VALUES (?, ?, ?, ?, NULL)',
      )
      .bind(invite.hash, invite.farm, invite.by, invite.expiresAt),
  ]);
};

/** A working invite by its code's hash: not expired, uses left. */
export const liveInvite = async (
  db: D1Database,
  hash: string,
  now: number,
): Promise<InviteRow | null> => {
  const row = await db
    .prepare('SELECT farm_id, expires_at, uses_left FROM invites WHERE code_hash = ?')
    .bind(hash)
    .first<InviteRow>();
  if (row === null) return null;
  if (row.expires_at !== null && row.expires_at <= now) return null;
  return row.uses_left !== null && row.uses_left <= 0 ? null : row;
};

export const useInvite = async (db: D1Database, hash: string) => {
  await db
    .prepare(
      'UPDATE invites SET uses_left = uses_left - 1 WHERE code_hash = ? AND uses_left IS NOT NULL',
    )
    .bind(hash)
    .run();
};

/* The waiting list, for farms where a keeper lets people in. */

export const addWaiting = async (
  db: D1Database,
  farm: FarmId,
  person: PersonId,
  profile: Profile,
  at: number,
) => {
  await db
    .prepare(
      `INSERT INTO farm_waiting (farm_id, person_id, name, critter, asked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (farm_id, person_id) DO UPDATE SET name = excluded.name, critter = excluded.critter`,
    )
    .bind(farm, person, profile.name, JSON.stringify(profile.critter), at)
    .run();
};

export type Waiting = Profile & { person: PersonId; askedAt: number };

type WaitingRow = { person_id: PersonId; name: string; critter: string; asked_at: number };

const waitingOf = (row: WaitingRow): Waiting => ({
  person: row.person_id,
  name: row.name,
  critter: Critter.parse(JSON.parse(row.critter)),
  askedAt: row.asked_at,
});

export const waitingList = async (db: D1Database, farm: FarmId): Promise<Waiting[]> => {
  const { results } = await db
    .prepare(
      'SELECT person_id, name, critter, asked_at FROM farm_waiting WHERE farm_id = ? ORDER BY asked_at, rowid LIMIT 100',
    )
    .bind(farm)
    .all<WaitingRow>();
  return results.map(waitingOf);
};

export const takeWaiting = async (
  db: D1Database,
  farm: FarmId,
  person: PersonId,
): Promise<Waiting | null> => {
  const row = await db
    .prepare(
      'DELETE FROM farm_waiting WHERE farm_id = ? AND person_id = ? RETURNING person_id, name, critter, asked_at',
    )
    .bind(farm, person)
    .first<WaitingRow>();
  return row === null ? null : waitingOf(row);
};
