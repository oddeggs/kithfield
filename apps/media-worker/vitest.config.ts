import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime against the `dev` environment's bindings, simulated
// locally, with the API's migrations applied (the media index lives in the API's database).
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, '../api/migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc', environment: 'dev' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            MEDIA_SIGNING_KEY: `${randomUUID()}${randomUUID()}`,
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
