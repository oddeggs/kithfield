import { type MediaEnv, serveMedia } from './serve';

// The Worker's entry: Wrangler needs it as the module's default export.
// eslint-disable-next-line no-restricted-syntax -- a Worker entry, like apps/api/src/index.ts
export default {
  fetch: (request, env, ctx) => serveMedia(request, env, ctx),
} satisfies ExportedHandler<MediaEnv>;
