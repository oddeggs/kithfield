import { CottageFarm, Critter } from '@kithfield/contracts';

/**
 * A farm the cottage hasn't been told about, read from D1: `farms (kind, name, pair)` and, for a
 * visit, the other person's name and critter from `people`. The farm object normally calls
 * `upsertFarm`; this keeps a missed call from hiding a chat. Null when D1 doesn't know enough
 * (no such farm, a farm with no name, a visit peer without a critter yet).
 */
export async function farmFromDirectory(
  db: D1Database,
  farm: string,
  person: string,
): Promise<CottageFarm | null> {
  try {
    const row = await db
      .prepare('SELECT kind, name, pair FROM farms WHERE id = ?')
      .bind(farm)
      .first<{ kind: string; name: string | null; pair: string | null }>();
    if (row === null) return null;
    if (row.kind === 'farm') {
      return parsed({ farm, farmKind: 'farm', name: row.name, with: null });
    }
    const peer = row.pair?.split(':').find((id) => id !== person);
    if (peer === undefined) return null;
    const who = await db
      .prepare('SELECT display_name AS name, critter, deleted_at AS gone FROM people WHERE id = ?')
      .bind(peer)
      .first<{ name: string | null; critter: string | null; gone: number | null }>();
    const critter = Critter.safeParse(who?.critter == null ? null : JSON.parse(who.critter));
    if (!critter.success) return null;
    const name = who?.gone == null ? (who?.name ?? null) : null;
    return parsed({
      farm,
      farmKind: 'visit',
      name: null,
      with: { person: peer, name, critter: critter.data },
    });
  } catch (error) {
    console.warn('farm directory lookup failed', { farm, error: String(error) });
    return null;
  }
}

function parsed(info: unknown): CottageFarm | null {
  const result = CottageFarm.safeParse(info);
  return result.success ? result.data : null;
}
