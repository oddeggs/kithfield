import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime against the `dev` environment's bindings, all simulated
// locally. The migration files are read here (Node) and applied in the runtime by the setup file.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc', environment: 'dev' },
        // A fresh auth secret per run: tests never share one with `.dev.vars` or a deployment.
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
            MEDIA_SIGNING_KEY: `${randomUUID()}${randomUUID()}`,
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
