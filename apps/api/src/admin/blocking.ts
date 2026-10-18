import type { Bindings } from '../env';

/*
 * Blocking itself belongs to the account routes (`PUT /v1/blocks/:person`). A report's "also
 * block" and the desk's "blocked by" signal reach it through this port once it is registered.
 * Until then the desk counts the blocks it saw asked for in reports, and keeps each ask on its
 * filing so none is lost.
 */

export interface BlockingPort {
  /** `by` blocks `person`; never disclosed to them. */
  block(env: Bindings, by: string, person: string): Promise<void>;
  /** How many people block `person`. */
  blockedBy(env: Bindings, person: string): Promise<number>;
}

let port: BlockingPort | null = null;

export const registerBlocking = (blocking: BlockingPort | null): void => {
  port = blocking;
};

export async function blockFromReport(env: Bindings, by: string, person: string): Promise<void> {
  if (port !== null) await port.block(env, by, person);
}

export async function blockedByCount(env: Bindings, person: string): Promise<number> {
  if (port !== null) return port.blockedBy(env, person);
  const row = await env.DB.prepare(
    `SELECT COUNT(DISTINCT f.reporter_id) AS n FROM report_filings f
     JOIN reports r ON r.id = f.report_id WHERE r.reported_id = ? AND f.also_block = 1`,
  )
    .bind(person)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
