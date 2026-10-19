import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from '@jest/globals';

const root = resolve(__dirname, '..');
const appDir = join(root, 'src', 'app');
const nativeRoutes = join(root, 'src', 'native-routes.ts');
const router = dirname(require.resolve('expo-router/package.json'));

type Resolution = { type: string; filePath?: string };
type ResolveRequest = (context: unknown, name: string, platform: string | null) => Resolution;

/** The file filter a route list (`require.context`) is made with: its one regular-expression line. */
function contextFilter(file: string): RegExp {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.replace(/,$/, ''))
    .find((l) => l.startsWith('/^') && l.endsWith('$/'));
  if (line === undefined) throw new Error(`No route filter in ${file}`);
  return new RegExp(line.slice(1, -1));
}

/** Every file under the router's root, named as `require.context` names them. */
const appFiles = readdirSync(appDir, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => `./${relative(appDir, join(d.parentPath, d.name)).split(sep).join('/')}`)
  .sort();

const isWeb = (file: string) => /\.web\.[tj]sx?$/.test(file);

/** The router's own lists for the phone: the one Metro resolves, and its per-platform ones. */
const routerContexts = (() => {
  const pkg = JSON.parse(readFileSync(join(router, 'package.json'), 'utf8')) as {
    exports: Record<string, Record<string, string>>;
  };
  const resolved = pkg.exports['./_ctx']?.default;
  if (resolved === undefined) throw new Error('expo-router no longer exports ./_ctx');
  return [resolved, './_ctx.ios.js', './_ctx.android.js']
    .map((file) => join(router, file))
    .filter((file) => existsSync(file));
})();

describe("the phone's route list", () => {
  const ours = contextFilter(nativeRoutes);
  const phone = appFiles.filter((file) => ours.test(file));

  it("is the router's own list without the browser's route files", () => {
    expect(routerContexts.length).toBeGreaterThan(0);
    for (const file of routerContexts) {
      const theirs = contextFilter(file);
      expect(phone).toEqual(appFiles.filter((f) => theirs.test(f) && !isWeb(f)));
    }
  });

  it("leaves out every browser route file and nothing else that's a route", () => {
    const web = appFiles.filter(isWeb);
    expect(web.length).toBeGreaterThan(0);
    for (const file of web) expect(phone).not.toContain(file);
    expect(phone).toContain('./_layout.tsx');
    expect(phone).toContain('./+not-found.tsx');
    expect(phone).toContain('./(onboarding)/i/[code].tsx');
  });

  it("lists the router's root", () => {
    expect(readFileSync(nativeRoutes, 'utf8')).toMatch(
      /require\.context\(\s*(?:\/\/.*\n\s*)*'\.\/app',/,
    );
    expect(existsSync(join(root, 'app'))).toBe(false);
  });
});

describe("Metro's route list", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro's config is CommonJS
  const config = require('../metro.config.js') as { resolver: { resolveRequest: ResolveRequest } };
  const fallback: ResolveRequest = (_context, name, platform) => ({
    type: 'sourceFile',
    filePath: `router:${name}:${String(platform)}`,
  });
  const resolveCtx = (platform: string | null) =>
    config.resolver.resolveRequest({ resolveRequest: fallback }, 'expo-router/_ctx', platform);

  it("is the phone's own on iOS and Android", () => {
    expect(resolveCtx('ios')).toEqual({ type: 'sourceFile', filePath: nativeRoutes });
    expect(resolveCtx('android')).toEqual({ type: 'sourceFile', filePath: nativeRoutes });
  });

  it("is the router's own in the browser", () => {
    expect(resolveCtx('web')).toEqual({
      type: 'sourceFile',
      filePath: 'router:expo-router/_ctx:web',
    });
  });
});
