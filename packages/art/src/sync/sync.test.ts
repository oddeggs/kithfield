import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Linter } from 'eslint';
import globals from 'globals';
import { describe, expect, it } from 'vitest';

import { CLOSURE_END, HOST_GLOBALS, renderFiles, renderModule } from './render';

const design = readFileSync(join(import.meta.dirname, '../../../../design/kithfield-art.js'));
const vendor = (name: string) => readFileSync(join(import.meta.dirname, '../vendor', name));

describe('the synced renderer', () => {
  it('is the design file byte for byte', () => {
    expect(vendor('kithfield-art.generated.js').equals(design)).toBe(true);
  });

  it('matches a fresh sync (run `pnpm --filter @kithfield/art sync` after a design change)', () => {
    for (const file of renderFiles(design)) {
      expect(vendor(file.name).equals(file.bytes), `${file.name} is stale`).toBe(true);
    }
  });

  it('wraps the design bytes unchanged, adding only the internals line', () => {
    const source = design.toString('utf8');
    const module = renderModule(source);
    const body = source.slice(0, source.length - CLOSURE_END.length);
    expect(module).toContain(body);
    const added = module.slice(module.indexOf(body) + body.length);
    const [hook, ...tail] = added.trim().split('\n');
    expect(hook).toMatch(/^window\.KF\.internals = \{.*\};$/);
    expect(tail).toEqual(['})();', 'return window.KF;', '}']);
  });

  it('refuses a design file whose closure it does not recognise', () => {
    expect(() => renderModule('(() => {})();')).toThrow(/closure/);
  });
});

/**
 * The renderer may only read ES built-ins and the globals the host supplies: a design update
 * that reaches for another browser global (`navigator`, `Image`…) would only fail at runtime on
 * the phone, so it fails here instead.
 */
function undefinedGlobals(source: string): string[] {
  const linter = new Linter({ configType: 'flat' });
  const messages = linter.verify(source, [
    {
      languageOptions: {
        ecmaVersion: 2024,
        sourceType: 'script',
        globals: {
          ...globals.es2024,
          ...Object.fromEntries(HOST_GLOBALS.map((g) => [g, 'readonly' as const])),
        },
      },
      rules: { 'no-undef': 'error' },
    },
  ]);
  return messages.map((m) => `${m.line}:${m.column} ${m.message}`);
}

describe('the renderer’s globals', () => {
  it('are ES built-ins or supplied by the host', () => {
    expect(undefinedGlobals(design.toString('utf8'))).toEqual([]);
  });

  it('catch a browser global the host does not supply', () => {
    expect(undefinedGlobals('(() => { navigator.vibrate(1); })();')).toEqual([
      "1:10 'navigator' is not defined.",
    ]);
  });
});
