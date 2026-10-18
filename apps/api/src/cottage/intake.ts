import { type CottageDelivery, PushJob, type RememberSeed } from '@kithfield/contracts';

import type { Bindings } from '../env';
import {
  budgetKey,
  candidateFor,
  categoryOf,
  collapseKeyFor,
  FEW_COPY,
  fewCollapseKey,
  NUDGE_LAST_COPY,
  REMEMBER_COPY,
  tag,
  knockAllows,
} from '../push/catalogue';
import { type LedgerRow, writeLedger } from '../push/ledger';
import { displayNameOf } from '../push/names';
import { DAY_MS, type Decision, decide, localClock } from '../push/policy';
import { enqueuePush } from '../push/queue';
import { isMuted, knockForOf, peerName } from './chats';
import { quietOf, readProfile, updateProfile, zoneOf } from './profile';
import { restsNow } from './resting';

/** What the cottage's push decisions run against. */
export interface Intake {
  readonly sql: SqlStorage;
  readonly env: Bindings;
  readonly person: string;
  readonly now: number;
}

/** Turns a delivered event into a push for this person, if it makes one, and decides on it. */
export async function considerDelivery(intake: Intake, delivery: CottageDelivery): Promise<void> {
  const everyMessage = knockForOf(intake.sql, delivery.farm).messages;
  const candidate = candidateFor(delivery, intake.person, everyMessage);
  if (candidate === null) return;
  const params: Record<string, string> = {};
  if (candidate.named && delivery.actor !== null) {
    const name =
      peerName(intake.sql, delivery.farm, delivery.actor) ??
      (await displayNameOf(intake.env.DB, delivery.actor));
    if (name !== null) params['name'] = name;
  }
  if (candidate.category === 'mention' && delivery.preview !== null) {
    params['preview'] = delivery.preview;
  }
  const { date } = localClock(intake.now, zoneOf(readProfile(intake.sql)));
  const job: PushJob = {
    person: intake.person,
    farm: delivery.farm,
    kind: delivery.kind,
    seq: delivery.seq,
    collapseKey: collapseKeyFor(candidate.category, delivery.farm, date, delivery.seq),
    copy: { key: candidate.copyKey, params },
    forYou: delivery.forYou,
    at: delivery.at,
  };
  await considerJob(intake, job, delivery.connected);
}

/** A remember-me seed's nudge, due now. */
export function reminderJob(person: string, seed: RememberSeed, now: number): PushJob {
  return {
    person,
    farm: seed.farm,
    kind: 'remember',
    seq: seed.fromSeq ?? null,
    collapseKey: `remember.${tag(seed.id)}`,
    copy: { key: REMEMBER_COPY, params: { title: seed.title } },
    forYou: true,
    at: now,
  };
}

function countOf(sql: SqlStorage, key: string): number {
  const row = sql.exec<{ count: number }>('SELECT count FROM budget WHERE key = ?', key).toArray();
  return row[0]?.count ?? 0;
}

function bump(sql: SqlStorage, key: string, now: number): void {
  sql.exec(
    `INSERT INTO budget (key, count, at) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET count = budget.count + 1, at = excluded.at`,
    key,
    now,
  );
}

/** Keeps a push until quiet hours end. `decided` pushes only need the last checks again. */
export function holdJob(sql: SqlStorage, job: PushJob, until: number, decided: boolean): void {
  sql.exec(
    'INSERT INTO held (id, job, until, decided) VALUES (?, ?, ?, ?)',
    crypto.randomUUID(),
    JSON.stringify(job),
    until,
    Number(decided),
  );
}

/** A push the queue refused is tried again this much later, through the rules. */
export const QUEUE_RETRY_MS = 60_000;

/** Puts a job on the push queue; false when the queue refused it. */
export async function tryEnqueue(env: Bindings, job: PushJob): Promise<boolean> {
  try {
    await enqueuePush(env, job);
    return true;
  } catch (error) {
    console.error('push queue refused a job', { error: String(error) });
    return false;
  }
}

/** The ledger is a record, not a gate: a failed write never loses the push it describes. */
export async function ledger(db: D1Database, rows: readonly LedgerRow[]): Promise<void> {
  try {
    await writeLedger(db, rows);
  } catch (error) {
    console.error('push ledger write failed', { rows: rows.length, error: String(error) });
  }
}

/**
 * Runs the push rules on a job and acts on the decision: skip it, hold it through quiet hours,
 * queue it, or collapse it into the day's "a few things" push. The budget is spent only once the
 * push is on the queue. Every decision is ledgered. A hold changes when the cottage's alarm should
 * ring; the caller reschedules it.
 */
export async function considerJob(
  intake: Intake,
  job: PushJob,
  connected: boolean,
): Promise<Decision> {
  const { sql, now } = intake;
  sql.exec('DELETE FROM budget WHERE at < ?', now - 3 * DAY_MS);
  sql.exec('DELETE FROM nudges_sent WHERE at < ?', now - 7 * DAY_MS);
  const profile = readProfile(sql);
  const category = categoryOf(job);
  const { date, minutes } = localClock(now, zoneOf(profile));
  const spendKey = budgetKey(category, job.farm, date, Math.floor(minutes / 60));
  const fewKey = category === 'doorstep' ? spendKey : fewCollapseKey(job.farm, date);
  const decided = decide({
    category,
    at: now,
    muted: isMuted(sql, job.farm, now),
    knockAllowed: knockAllows(knockForOf(sql, job.farm), job, category),
    hibernating: profile.hibernating,
    connected,
    quiet: quietOf(profile),
    nudges: profile.settings.nudges,
    backOffWhenQuiet: profile.settings.backOffWhenQuiet,
    nudgesSinceBack: profile.nudgesSinceBack,
    nudgesThisWeek: sql.exec<{ n: number }>('SELECT count(*) AS n FROM nudges_sent').one().n,
    sentToday: countOf(sql, spendKey),
    fewSent: countOf(sql, `few.${fewKey}`) > 0,
  });
  // A kind resting after unopened pushes goes nowhere, not even into "a few things".
  const outgoing = decided.action !== 'skip' && decided.action !== 'hold';
  const decision: Decision =
    outgoing && restsNow(sql, job, now) ? { action: 'skip', reason: 'resting' } : decided;

  const base = {
    person: job.person,
    kind: job.kind,
    farm: job.farm,
    seq: job.seq,
    collapseKey: job.collapseKey,
    at: now,
  };
  const rows: LedgerRow[] = [];
  switch (decision.action) {
    case 'skip':
      rows.push({ ...base, decision: 'skipped', reason: decision.reason });
      break;
    case 'hold':
      holdJob(sql, job, decision.until, false);
      rows.push({ ...base, decision: 'held', reason: 'quiet_hours' });
      break;
    case 'send': {
      const copy = decision.last ? { key: NUDGE_LAST_COPY, params: {} } : job.copy;
      if (!(await tryEnqueue(intake.env, PushJob.parse({ ...job, copy })))) {
        holdJob(sql, job, now + QUEUE_RETRY_MS, false);
        rows.push({ ...base, decision: 'held', reason: 'queue_failed' });
        break;
      }
      bump(sql, spendKey, now);
      if (category === 'nudge') {
        sql.exec('INSERT INTO nudges_sent (at) VALUES (?)', now);
        updateProfile(sql, (p) => ({ ...p, nudgesSinceBack: p.nudgesSinceBack + 1 }));
      }
      rows.push({ ...base, decision: 'queued' });
      break;
    }
    case 'collapse': {
      const few = {
        ...job,
        collapseKey: fewKey,
        copy: { key: category === 'doorstep' ? FEW_COPY.doorstep : FEW_COPY.farm, params: {} },
      };
      if (!(await tryEnqueue(intake.env, PushJob.parse(few)))) {
        holdJob(sql, job, now + QUEUE_RETRY_MS, false);
        rows.push({ ...base, decision: 'held', reason: 'queue_failed' });
        break;
      }
      bump(sql, spendKey, now);
      bump(sql, `few.${fewKey}`, now);
      rows.push({
        ...base,
        collapseKey: fewKey,
        decision: 'queued',
        reason: 'budget',
        collapsed: 1,
      });
      break;
    }
    case 'fold':
      bump(sql, spendKey, now);
      rows.push({ ...base, collapseKey: fewKey, decision: 'collapsed', reason: 'budget' });
      break;
  }
  await ledger(intake.env.DB, rows);
  return decision;
}
