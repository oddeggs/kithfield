import { createApp } from './app';
import type { Bindings } from './env';
import { sweepMedia } from './media';
import { consumeQueue } from './queues';
import { keepWaitlistTidy } from './web/waitlist-store';

// Durable Object classes are exported from the entry, as `wrangler.jsonc` names them.
export { CottageDO } from './cottage/cottage-object';
export { FarmDO } from './farm/farm-object';

const app = createApp();

export default {
  fetch: app.fetch,
  queue: consumeQueue,
  // The daily cron (`wrangler.jsonc` triggers).
  scheduled: (controller, env, ctx) => {
    ctx.waitUntil(keepWaitlistTidy(env.DB, controller.scheduledTime));
    // Uploads left unfinished for a week.
    ctx.waitUntil(sweepMedia(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Bindings>;
