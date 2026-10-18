import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CLOSURE_END, renderFiles, renderModule } from './render';

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
