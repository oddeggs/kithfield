import { keepModerationTidy } from './admin/retention';
import { createApp } from './app';
import { queueDuePurges } from './auth';
import { expireExports } from './auth/export';
import type { Bindings } from './env';
import { consumeQueue } from './queues';
import { keepWaitlistTidy } from './web/waitlist-store';

// Durable Object classes are exported from the entry, as `wrangler.jsonc` names them.
export { CottageDO } from './cottage/cottage-object';
export { FarmDO } from './farm/farm-object';

const app = createApp();

export default {
  fetch: app.fetch,
  queue: consumeQueue,
  // The daily cron (`wrangler.jsonc` triggers): the waitlist's retention, expired keepsakes
  // exports, the safety desk's retention, and accounts whose 30 days are over go on the deletion
  // queue.
  scheduled: (controller, env, ctx) => {
    ctx.waitUntil(keepWaitlistTidy(env.DB, controller.scheduledTime));
    ctx.waitUntil(queueDuePurges(env, controller.scheduledTime));
    ctx.waitUntil(expireExports(env, controller.scheduledTime));
    ctx.waitUntil(keepModerationTidy(env.DB, controller.scheduledTime));
  },
} satisfies ExportedHandler<Bindings>;
