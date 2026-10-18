import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = join(__dirname, '../../app');

/** The root layout's development-only block: everything inside `Stack.Protected guard={__DEV__}`. */
const devBlock = () => {
  const layout = readFileSync(join(app, '_layout.tsx'), 'utf8');
  const block = /<Stack\.Protected guard=\{__DEV__\}>([\s\S]*?)<\/Stack\.Protected>/.exec(layout);
  return block?.[1] ?? '';
};

describe('development screens', () => {
  it('are each listed behind the root layout’s development guard', () => {
    const block = devBlock();
    const routes = readdirSync(join(app, '(dev)'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => `(dev)/${f.replace(/\.tsx$/, '')}`);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) expect(block).toContain(`<Stack.Screen name="${route}" />`);
  });

  it('require their screens only in development builds', () => {
    for (const f of readdirSync(join(app, '(dev)')).filter((n) => n.endsWith('.tsx'))) {
      const source = readFileSync(join(app, '(dev)', f), 'utf8');
      expect(source).toMatch(/= __DEV__\s*\?/);
      expect(source).not.toMatch(/^import (?!type )[^;]*from '\.\.\/\.\.\/(ui|features)\//m);
    }
  });
});
