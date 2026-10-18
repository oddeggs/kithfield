import type { RememberRequest, RememberSeed } from '@kithfield/contracts';

/** A person keeps at most this many remember-me seeds (`RememberList`). */
export const SEEDS_CAP = 200;

type SeedRow = {
  id: string;
  farm: string;
  from_seq: number | null;
  about: string;
  title: string;
  nudge_at: number;
  created_at: number;
};

function toSeed(row: SeedRow): RememberSeed {
  return {
    id: row.id,
    farm: row.farm,
    ...(row.from_seq === null ? {} : { fromSeq: row.from_seq }),
    about: row.about,
    title: row.title,
    nudgeAt: row.nudge_at,
    createdAt: row.created_at,
  };
}

/** Plants a seed; null when the person already keeps the most they can. */
export function plantSeed(sql: SqlStorage, request: RememberRequest, now: number): string | null {
  const count = sql.exec<{ n: number }>('SELECT count(*) AS n FROM seeds').one().n;
  if (count >= SEEDS_CAP) return null;
  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO seeds (id, farm, from_seq, about, title, nudge_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    request.farm,
    request.fromSeq ?? null,
    request.about,
    request.title,
    request.nudgeAt,
    now,
  );
  return id;
}

/** The seeds still waiting to nudge, soonest first. */
export function listSeeds(sql: SqlStorage): RememberSeed[] {
  return sql
    .exec<SeedRow>(`SELECT * FROM seeds ORDER BY nudge_at, created_at LIMIT ${SEEDS_CAP}`)
    .toArray()
    .map(toSeed);
}

export function removeSeed(sql: SqlStorage, id: string): boolean {
  return sql.exec('DELETE FROM seeds WHERE id = ?', id).rowsWritten > 0;
}

/** The seeds whose nudge is due. Each leaves the list once its nudge is handled. */
export function dueSeeds(sql: SqlStorage, now: number): RememberSeed[] {
  return sql
    .exec<SeedRow>('SELECT * FROM seeds WHERE nudge_at <= ? ORDER BY nudge_at', now)
    .toArray()
    .map(toSeed);
}

export function nextSeedAt(sql: SqlStorage): number | null {
  return sql.exec<{ at: number | null }>('SELECT min(nudge_at) AS at FROM seeds').one().at;
}
