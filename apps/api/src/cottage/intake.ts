import { type CottageDelivery, type Lang, PushJob, type RememberSeed } from '@kithfield/contracts';

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
} from '../push/catalogue';
import { type LedgerRow, writeLedger } from '../push/ledger';
import { displayNameOf } from '../push/names';
import {
  DAY_MS,
  type Decision,
  decide,
  effectiveQuiet,
  localClock,
  quietEndsAt,
} from '../push/policy';
import { enqueuePush } from '../push/queue';
import { farmTitle, isMuted, peerName } from './chats';
import { pushTargets, type PushTarget } from './devices';
import { readProfile, updateProfile } from './profile';

/** What the cottage's push decisions run against. */
export interface Intake {
  readonly sql: SqlStorage;
  readonly env: Bindings;
  readonly person: string;
  readonly now: number;
}

/** Turns a delivered event into a push for this person, if it makes one, and decides on it. */
export async function considerDelivery(intake: Intake, delivery: CottageDelivery): Promise<void> {
  const candidate = candidateFor(delivery, intake.person);
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
  const { date } = localClock(intake.now, quietOf(intake.sql).timeZone);
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

function quietOf(sql: SqlStorage) {
  const profile = readProfile(sql);
  return effectiveQuiet(profile.settings.quietHours, profile.lastTimeZone);
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

/**
 * Runs the push rules on a job and acts on the decision: skip it, hold it through quiet hours,
 * queue it, or collapse it into the day's "a few things" push. Every decision is ledgered. A
 * hold changes when the cottage's alarm should ring; the caller reschedules it.
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
  const quiet = effectiveQuiet(profile.settings.quietHours, profile.lastTimeZone);
  const category = categoryOf(job);
  const { date } = localClock(now, quiet.timeZone);
  const spendKey = budgetKey(category, job.farm, date);
  const fewKey = category === 'doorstep' ? spendKey : fewCollapseKey(job.farm, date);
  const decision = decide({
    category,
    at: now,
    muted: isMuted(sql, job.farm, now),
    hibernating: profile.hibernating,
    connected,
    quiet,
    nudges: profile.settings.nudges,
    backOffWhenQuiet: profile.settings.backOffWhenQuiet,
    nudgesSinceBack: profile.nudgesSinceBack,
    nudgesThisWeek: sql.exec<{ n: number }>('SELECT count(*) AS n FROM nudges_sent').one().n,
    sentToday: countOf(sql, spendKey),
    fewSent: countOf(sql, `few.${fewKey}`) > 0,
  });

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
      sql.exec(
        'INSERT INTO held (id, job, until) VALUES (?, ?, ?)',
        crypto.randomUUID(),
        JSON.stringify(job),
        decision.until,
      );
      rows.push({ ...base, decision: 'held', reason: 'quiet_hours' });
      break;
    case 'send': {
      bump(sql, spendKey, now);
      if (category === 'nudge') {
        sql.exec('INSERT INTO nudges_sent (at) VALUES (?)', now);
        updateProfile(sql, (p) => ({ ...p, nudgesSinceBack: p.nudgesSinceBack + 1 }));
      }
      const copy = decision.last ? { key: NUDGE_LAST_COPY, params: {} } : job.copy;
      await enqueuePush(intake.env, PushJob.parse({ ...job, copy }));
      rows.push({ ...base, decision: 'queued' });
      break;
    }
    case 'collapse': {
      bump(sql, spendKey, now);
      bump(sql, `few.${fewKey}`, now);
      const few = {
        ...job,
        collapseKey: fewKey,
        copy: { key: category === 'doorstep' ? FEW_COPY.doorstep : FEW_COPY.farm, params: {} },
      };
      await enqueuePush(intake.env, PushJob.parse(few));
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
  await writeLedger(intake.env.DB, rows);
  return decision;
}

/**
 * Once quiet hours are over (by the person's settings now, which may have changed since), decides
 * again on every held push, oldest first. Still quiet: they wait for the new end.
 */
export async function releaseHeld(intake: Intake): Promise<void> {
  const until = quietEndsAt(intake.now, quietOf(intake.sql));
  if (until !== null) {
    intake.sql.exec('UPDATE held SET until = ?', until);
    return;
  }
  const due = intake.sql
    .exec<{ id: string; job: string }>('SELECT id, job FROM held ORDER BY until, rowid')
    .toArray();
  for (const { id, job } of due) {
    intake.sql.exec('DELETE FROM held WHERE id = ?', id);
    await considerJob(intake, PushJob.parse(JSON.parse(job)), false);
  }
}

export function nextHeldAt(sql: SqlStorage): number | null {
  return sql.exec<{ at: number | null }>('SELECT min(until) AS at FROM held').one().at;
}

/** What the push consumer needs to send a job now, or why it shouldn't. */
export type Claim =
  | {
      readonly action: 'send';
      readonly lang: Lang;
      /** The farm's name, or the other person's on a visit; null for a push with no farm. */
      readonly title: string | null;
      readonly targets: readonly PushTarget[];
    }
  | { readonly action: 'skip'; readonly reason: 'muted' | 'hibernating' | 'no_device' }
  | { readonly action: 'hold'; readonly until: number };

/**
 * The consumer's check just before sending: the person may have hibernated, muted the farm or
 * entered quiet hours since the job was queued. The budget was spent when it was queued. A job
 * that meets quiet hours now is held here again.
 */
export function claimJob(intake: Intake, job: PushJob): Claim {
  const { sql, now } = intake;
  const profile = readProfile(sql);
  const category = categoryOf(job);
  if (profile.hibernating) return { action: 'skip', reason: 'hibernating' };
  if (category !== 'reminder' && isMuted(sql, job.farm, now)) {
    return { action: 'skip', reason: 'muted' };
  }
  const until = quietEndsAt(now, effectiveQuiet(profile.settings.quietHours, profile.lastTimeZone));
  if (until !== null) {
    sql.exec(
      'INSERT INTO held (id, job, until) VALUES (?, ?, ?)',
      crypto.randomUUID(),
      JSON.stringify(job),
      until,
    );
    return { action: 'hold', until };
  }
  const targets = pushTargets(sql);
  if (targets.length === 0) return { action: 'skip', reason: 'no_device' };
  return { action: 'send', lang: profile.settings.lang, title: farmTitle(sql, job.farm), targets };
}
