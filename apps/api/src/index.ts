import { createApp } from './app';
import type { Bindings } from './env';
import { consumeQueue } from './queues';

// Durable Object classes are exported from the entry, as `wrangler.jsonc` names them.
export { CottageDO } from './cottage/cottage-object';
export { FarmDO } from './farm/farm-object';

const app = createApp();

export default {
  fetch: app.fetch,
  queue: consumeQueue,
} satisfies ExportedHandler<Bindings>;
