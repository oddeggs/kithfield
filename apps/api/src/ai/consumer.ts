import { AiJob } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { recapGaveUp, runRecap } from './recap';
import { captionGaveUp, runVoiceCaption } from './voice';

/*
 * The `ai` queue's consumer. Each job reads consent again before reading anything it would send,
 * and is safe to run again: a message delivered twice finds its work done and sends nothing.
 */

/** Tries before a job gives up: the first delivery and the queue's three retries. */
export const AI_ATTEMPTS = 4;

/** Seconds before a retry: 60, 120, 240. */
export const aiBackoffSeconds = (attempts: number): number =>
  Math.min(60 * 2 ** Math.max(0, attempts - 1), 15 * 60);

export async function consumeAi(batch: MessageBatch, env: Bindings): Promise<void> {
  for (const message of batch.messages) {
    const parsed = AiJob.safeParse(message.body);
    if (!parsed.success) {
      console.warn('unknown ai message', { id: message.id });
      message.ack();
      continue;
    }
    const job = parsed.data;
    try {
      if (job.kind === 'recap') await runRecap(env, env.AI, job);
      else await runVoiceCaption(env, env.AI, job);
      message.ack();
    } catch (error) {
      // The log names the job, never its words.
      console.error('ai job failed', {
        id: message.id,
        kind: job.kind,
        farm: job.farm,
        attempts: message.attempts,
        error: error instanceof Error ? error.message : 'unknown',
      });
      if (message.attempts >= AI_ATTEMPTS) {
        await (job.kind === 'recap' ? recapGaveUp(env, job) : captionGaveUp(env, job)).catch(
          () => undefined,
        );
        message.ack();
      } else {
        message.retry({ delaySeconds: aiBackoffSeconds(message.attempts) });
      }
    }
  }
}
