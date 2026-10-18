import { type BlockList, Critter, DisplayName, PersonId } from '@kithfield/contracts';
import { Hono } from 'hono';

import { registerMergeStep } from './merge-steps';
import { errorResponse, requireSession, type SessionEnv } from './session';

/*
 * Blocking (`PUT`/`DELETE /v1/blocks/:person`, `GET /v1/blocks`). A block works both ways: between
 * two people where either blocked the other, no visit opens, no gate gesture or trade passes, the
 * gate doesn't show one to the other, no addressed gesture passes inside a shared farm, and
 * neither one's cottage pushes the other's news.
 */

/** Whether either person has blocked the other. */
export async function eitherBlocked(db: D1Database, a: string, b: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)
       LIMIT 1`,
    )
    .bind(a, b)
    .first();
  return row !== null;
}

/**
 * `blocker` blocks `blocked`, from the app or from a report's "also block". Never disclosed to the
 * blocked person; blocking twice keeps the first time.
 */
export async function blockPerson(
  db: D1Database,
  blocker: string,
  blocked: string,
  at: number,
): Promise<void> {
  if (blocker === blocked) return;
  await db
    .prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, at) VALUES (?, ?, ?)')
    .bind(blocker, blocked, at)
    .run();
}

/** How many people block `person`, for the safety desk. */
export async function blockerCount(db: D1Database, person: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM blocks WHERE blocked_id = ?')
    .bind(person)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

type BlockRow = {
  blocked_id: string;
  at: number;
  display_name: string | null;
  critter: string | null;
  deleted_at: number | null;
};

const critterOf = (json: string | null): Critter | null => {
  if (json === null) return null;
  try {
    const parsed = Critter.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** The person's blocks, newest first, with how to draw each; a deleted account has no name. */
export async function listBlocks(db: D1Database, blocker: string): Promise<BlockList> {
  const { results } = await db
    .prepare(
      `SELECT b.blocked_id, b.at, p.display_name, p.critter, p.deleted_at
       FROM blocks b LEFT JOIN people p ON p.id = b.blocked_id
       WHERE b.blocker_id = ? ORDER BY b.at DESC, b.blocked_id LIMIT 1000`,
    )
    .bind(blocker)
    .all<BlockRow>();
  return {
    blocked: results.map((row) => {
      const gone = row.deleted_at !== null;
      const name = DisplayName.safeParse(row.display_name);
      return {
        person: row.blocked_id,
        name: !gone && name.success ? name.data : null,
        critter: gone ? null : critterOf(row.critter),
        at: row.at,
      };
    }),
  };
}

/**
 * A merge moves the anonymous person's blocks to the kept person, and blocks of the anonymous
 * person onto the kept one, never onto the blocker themselves.
 */
registerMergeStep('blocks', (db, { from, into }) => [
  db
    .prepare(
      `INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, at)
       SELECT ?2, blocked_id, at FROM blocks WHERE blocker_id = ?1 AND blocked_id <> ?2`,
    )
    .bind(from, into),
  db
    .prepare(
      `INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, at)
       SELECT blocker_id, ?2, at FROM blocks WHERE blocked_id = ?1 AND blocker_id <> ?2`,
    )
    .bind(from, into),
  db.prepare('DELETE FROM blocks WHERE blocker_id = ?1 OR blocked_id = ?1').bind(from),
]);

export function blockRoutes(): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.get('/v1/blocks', requireSession, async (c) =>
    c.json((await listBlocks(c.env.DB, c.var.person)) satisfies BlockList),
  );

  // Blocking someone is never disclosed to them; blocking twice keeps the first time.
  routes.put('/v1/blocks/:person', requireSession, async (c) => {
    const person = PersonId.safeParse(c.req.param('person'));
    if (!person.success) return errorResponse(c, 404, 'not_found');
    if (person.data === c.var.person) return errorResponse(c, 400, 'bad_request', ['person']);
    const known = await c.env.DB.prepare('SELECT 1 FROM people WHERE id = ?')
      .bind(person.data)
      .first();
    if (known === null) return errorResponse(c, 404, 'not_found');
    await blockPerson(c.env.DB, c.var.person, person.data, Date.now());
    return c.body(null, 204);
  });

  routes.delete('/v1/blocks/:person', requireSession, async (c) => {
    const person = PersonId.safeParse(c.req.param('person'));
    if (!person.success) return errorResponse(c, 404, 'not_found');
    await c.env.DB.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?')
      .bind(c.var.person, person.data)
      .run();
    return c.body(null, 204);
  });

  return routes;
}
