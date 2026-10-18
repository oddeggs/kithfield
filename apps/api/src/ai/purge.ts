import { registerAccountDeletionStep, registerAiForgetStep, registerMergeStep } from '../auth';
import { dropCaptionsBy, dropLettersFrom } from './store';

/*
 * The AI features' share of deleting and merging. Each step is safe to run again.
 * - Withdrawing consent and asking to forget (`consent_forget`): `voice_notes` deletes every
 *   caption of the person's voice notes; `recap` deletes every letter their words went into. Fire
 *   captions are never kept, so there is nothing to delete for them; Workers AI keeps nothing
 *   once a request is answered.
 * - Account deletion: both of the above.
 * - A merge: captions and letter sources move to the kept person.
 * An unsent or removed voice note's captions go with its media (a trigger on the media index), and
 * the hourly sweep deletes their words.
 */

registerAiForgetStep('ai', async (env, job) => {
  if (job.feature === 'voice_notes') await dropCaptionsBy(env, job.person);
  if (job.feature === 'recap') await dropLettersFrom(env, job.person);
});

registerAccountDeletionStep('ai', async (env, person) => {
  await dropCaptionsBy(env, person);
  await dropLettersFrom(env, person);
});

registerMergeStep('ai', (db, { from, into }) => [
  db.prepare('UPDATE voice_captions SET author_id = ?2 WHERE author_id = ?1').bind(from, into),
  db
    .prepare(
      `INSERT OR IGNORE INTO recap_sources (farm_id, week, person_id)
       SELECT farm_id, week, ?2 FROM recap_sources WHERE person_id = ?1`,
    )
    .bind(from, into),
  db.prepare('DELETE FROM recap_sources WHERE person_id = ?').bind(from),
]);
