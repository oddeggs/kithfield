import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vitest/config';

// Every workspace package under packages/ and tools/ is a test project; one may add its own
// vitest.config.ts. The apps run their own runners (the API in the Workers pool, the app in Jest).
const projects = ['packages', 'tools'].flatMap((group) => {
  const dir = join(import.meta.dirname, group);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, 'package.json')))
    .map((name) => `${group}/${name}`);
});

export default defineConfig({
  // With no packages yet there is nothing to run, and that is a pass.
  test:
    projects.length > 0
      ? { projects, passWithNoTests: true }
      : { include: [], passWithNoTests: true },
});
