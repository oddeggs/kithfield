import { type Lang, PushJob } from '@kithfield/contracts';

import { categoryOf } from '../push/catalogue';
import { holdUntil, KNOCK_LIFETIME_MS } from '../push/policy';
import { farmTitle, isMuted, knowsFarm } from './chats';
import { pushTargets, type PushTarget } from './devices';
import { considerJob, holdJob, type Intake, ledger, QUEUE_RETRY_MS, tryEnqueue } from './intake';
import { quietOf, readProfile } from './profile';

/** Why a push that was already decided on is not sent after all. */
export type LateSkip = 'muted' | 'hibernating' | 'left' | 'expired';

/** What the push consumer needs to send a job now, or why it shouldn't. */
export type Claim =
  | {
      readonly action: 'send';
      readonly lang: Lang;
      /** The farm's name, or the other person's on a visit; null for a push with no farm. */
      readonly title: string | null;
      readonly targets: readonly PushTarget[];
    }
  | { readonly action: 'skip'; readonly reason: LateSkip | 'no_device' }
  | { readonly action: 'hold'; readonly until: number };

/**
 * The checks a decided push still has to pass: the person may have hibernated, muted or left the
 * farm since, or a knock may have gone stale. Quiet hours are checked by the caller.
 */
function lateSkip(intake: Intake, job: PushJob): LateSkip | null {
  const { sql, now } = intake;
  const category = categoryOf(job);
  if (readProfile(sql).hibernating) return 'hibernating';
  if (category !== 'reminder' && job.farm !== null && !knowsFarm(sql, job.farm)) return 'left';
  if (category !== 'reminder' && isMuted(sql, job.farm, now)) return 'muted';
  if (category === 'knock' && now - job.at > KNOCK_LIFETIME_MS) return 'expired';
  return null;
}

/**
 * The consumer's check just before sending. The budget was spent when the job was queued. A job
 * that meets quiet hours now is held here again, marked decided; a knock is dropped instead.
 */
export function claimJob(intake: Intake, job: PushJob): Claim {
  const { sql, now } = intake;
  const skip = lateSkip(intake, job);
  if (skip !== null) return { action: 'skip', reason: skip };
  const profile = readProfile(sql);
  const until = holdUntil(now, quietOf(profile));
  if (until !== null) {
    if (categoryOf(job) === 'knock') return { action: 'skip', reason: 'expired' };
    holdJob(sql, job, until, true);
    return { action: 'hold', until };
  }
  const targets = pushTargets(sql);
  if (targets.length === 0) return { action: 'skip', reason: 'no_device' };
  return { action: 'send', lang: profile.settings.lang, title: farmTitle(sql, job.farm), targets };
}

/**
 * Once quiet hours are over (by the person's settings now, which may have changed since), sends on
 * every held push, oldest first: undecided ones go through the rules, decided ones only through the
 * late checks. Still quiet: they wait for the new end. A row leaves only once it is handled.
 */
export async function releaseHeld(intake: Intake): Promise<void> {
  const until = holdUntil(intake.now, quietOf(readProfile(intake.sql)));
  if (until !== null) {
    intake.sql.exec('UPDATE held SET until = ?', until);
    return;
  }
  const due = intake.sql
    .exec<{ id: string; job: string; decided: number }>(
      'SELECT id, job, decided FROM held ORDER BY until, rowid',
    )
    .toArray();
  for (const row of due) {
    const job = PushJob.parse(JSON.parse(row.job));
    if (row.decided === 1 && !(await releaseDecided(intake, job))) {
      intake.sql.exec(
        'UPDATE held SET until = ? WHERE id = ?',
        intake.now + QUEUE_RETRY_MS,
        row.id,
      );
      continue;
    }
    if (row.decided !== 1) await considerJob(intake, job, false);
    intake.sql.exec('DELETE FROM held WHERE id = ?', row.id);
  }
}

/** Sends on a decided push; false when the queue refused it and it should stay held. */
async function releaseDecided(intake: Intake, job: PushJob): Promise<boolean> {
  const base = {
    person: job.person,
    kind: job.kind,
    farm: job.farm,
    seq: job.seq,
    collapseKey: job.collapseKey,
    at: intake.now,
  };
  const skip = lateSkip(intake, job);
  if (skip !== null) {
    await ledger(intake.env.DB, [{ ...base, decision: 'skipped', reason: skip }]);
    return true;
  }
  if (!(await tryEnqueue(intake.env, job))) return false;
  await ledger(intake.env.DB, [{ ...base, decision: 'queued', reason: 'released' }]);
  return true;
}

export function nextHeldAt(sql: SqlStorage): number | null {
  return sql.exec<{ at: number | null }>('SELECT min(until) AS at FROM held').one().at;
}
