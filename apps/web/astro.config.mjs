import { defineConfig } from 'astro/config';

// `astro dev` hands `/api` to a local API Worker (`pnpm --filter @kithfield/api dev`), as the routes
// do deployed. Set API_ORIGIN when it runs on another port.
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:8787';

/**
 * Invite links are `/i/<code>`: one static page reads the code from the address. Deployed, the
 * assets' `_redirects` serves `/invite` for them; this does the same under `astro dev`.
 */
function rewriteInvite(req, _res, next) {
  if (req.url && /^\/(vi\/)?i\/[^/?#]+/.test(req.url)) {
    req.url = req.url.startsWith('/vi/') ? '/vi/invite' : '/invite';
  }
  next();
}
const invitePages = {
  name: 'kithfield-invite-pages',
  configureServer(server) {
    server.middlewares.use(rewriteInvite);
  },
  configurePreviewServer(server) {
    server.middlewares.use(rewriteInvite);
  },
};

// A static site: every page is built ahead of time and served by a Worker's static assets
// (`wrangler.jsonc`). The API Worker owns `<host>/api/*` on the same host.
export default defineConfig({
  site: 'https://kithfield.com',
  output: 'static',
  // `file` writes `privacy.html`, so `/privacy` is served without a redirect.
  build: { inlineStylesheets: 'always', format: 'file' },
  vite: {
    plugins: [invitePages],
    server: { proxy: { '/api': apiOrigin } },
    preview: { proxy: { '/api': apiOrigin } },
  },
});
