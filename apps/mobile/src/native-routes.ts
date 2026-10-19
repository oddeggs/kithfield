/**
 * The phone's routes: every file under `src/app` except the browser's own (`*.web.tsx`). Expo
 * Router's own list takes every file and skips another platform's when it builds the routes, so
 * the browser's layouts and everything they import would still be bundled into the phone's app.
 * Metro gives the router this list on iOS and Android (`metro.config.js`); the browser keeps the
 * router's own. The same filter otherwise: no API routes, `+html` or `+middleware`.
 */
export const ctx = require.context(
  // The router's root (`src/app`), beside this file.
  './app',
  true,
  /^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)|(?:\+middleware)))\.[tj]sx?$)(?!.*\.web\.[tj]sx?$).*\.[tj]sx?$/,
  process.env.EXPO_ROUTER_IMPORT_MODE as 'sync' | 'lazy',
);
