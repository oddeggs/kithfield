import { keepModerationTidy } from './admin/retention';
import { queueDueRecaps, sweepAiWords } from './ai';
import { createApp } from './app';
import { queueDuePurges } from './auth';
import { expireExports } from './auth/export';
import type { Bindings } from './env';
import { sweepMedia } from './media';
import { consumeQueue } from './queues';
import { keepWaitlistTidy } from './web/waitlist-store';

// Durable Object classes are exported from the entry, as `wrangler.jsonc` names them.
export { CottageDO } from './cottage/cottage-object';
export { FarmDO } from './farm/farm-object';

const app = createApp();

/** The hourly cron in `wrangler.jsonc`; every other cron is the daily one. */
const HOURLY_CRON = '7 * * * *';

export default {
  fetch: app.fetch,
  queue: consumeQueue,
  scheduled: (controller, env, ctx) => {
    if (controller.cron === HOURLY_CRON) {
      // The Sunday recap letters due in each farm's time zone, and the AI's words owed a delete.
      ctx.waitUntil(queueDueRecaps(env, controller.scheduledTime));
      ctx.waitUntil(sweepAiWords(env));
      return;
    }
    // The daily cron: the waitlist's retention, expired keepsakes exports, the safety desk's
    // retention, and accounts whose 30 days are over go on the deletion queue.
    ctx.waitUntil(keepWaitlistTidy(env.DB, controller.scheduledTime));
    ctx.waitUntil(queueDuePurges(env, controller.scheduledTime));
    ctx.waitUntil(expireExports(env, controller.scheduledTime));
    ctx.waitUntil(keepModerationTidy(env.DB, controller.scheduledTime));
    // Uploads left unfinished, or finished but sent in no event, for a week.
    ctx.waitUntil(sweepMedia(env, controller.scheduledTime, { unreferenced: true }));
  },
} satisfies ExportedHandler<Bindings>;
