import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type BrowserContext, type Route } from 'playwright';

/** Headers worth replaying: the type, and CORS so fonts and SRI-checked scripts still load. */
const KEPT_HEADERS = ['content-type', 'access-control-allow-origin', 'timing-allow-origin'];

interface CachedResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
}

/**
 * Routes every request that leaves the local server (Google Fonts, the React UMD scripts) through
 * a disk cache: fetched once, then replayed byte for byte, so renders are stable and work offline.
 */
export async function routeThroughCache(
  context: BrowserContext,
  localOrigin: string,
  cacheDir: string,
  offline: boolean,
): Promise<void> {
  mkdirSync(cacheDir, { recursive: true });
  await context.route(
    (url) => url.protocol.startsWith('http') && url.origin !== localOrigin,
    (route) => fulfillFromCache(route, cacheDir, offline),
  );
}

async function fulfillFromCache(route: Route, cacheDir: string, offline: boolean): Promise<void> {
  const request = route.request();
  if (request.method() !== 'GET') {
    await route.abort();
    return;
  }
  const url = request.url();
  const key = createHash('sha256').update(url).digest('hex').slice(0, 32);
  const metaPath = join(cacheDir, `${key}.json`);
  const bodyPath = join(cacheDir, `${key}.body`);
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as CachedResponse;
    await route.fulfill({ status: meta.status, headers: meta.headers, body: readFileSync(bodyPath) });
    return;
  } catch {
    // Not cached yet.
  }
  if (offline) {
    console.warn(`offline and not cached: ${url}`);
    await route.abort('internetdisconnected');
    return;
  }
  const response = await route.fetch();
  const body = await response.body();
  const all = response.headers();
  const headers = Object.fromEntries(
    KEPT_HEADERS.flatMap((name) => (all[name] ? [[name, all[name]]] : [])),
  );
  if (response.ok()) {
    // Written to a temporary name and renamed, so a parallel page never reads half a file.
    const meta: CachedResponse = { url, status: response.status(), headers };
    writeAtomic(bodyPath, body);
    writeAtomic(metaPath, JSON.stringify(meta));
  }
  await route.fulfill({ status: response.status(), headers, body });
}

function writeAtomic(path: string, data: string | Buffer): void {
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}`;
  writeFileSync(temp, data);
  renameSync(temp, path);
}
