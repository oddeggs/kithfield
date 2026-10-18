import { defineConfig } from 'astro/config';

// A static site: every page is built ahead of time and served by a Worker's static assets
// (`wrangler.jsonc`). The API Worker owns `<host>/api/*` on the same host.
export default defineConfig({
  site: 'https://kithfield.com',
  output: 'static',
  // `file` writes `privacy.html`, so `/privacy` is served without a redirect.
  build: { inlineStylesheets: 'always', format: 'file' },
  // `astro dev` hands `/api` to a local API (`pnpm --filter @kithfield/api dev`), as the routes do deployed.
  vite: { server: { proxy: { '/api': 'http://127.0.0.1:8787' } } },
});
