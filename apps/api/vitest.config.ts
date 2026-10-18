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
        // Workers AI is always remote; tests never reach Cloudflare and stand in for the binding.
        remoteBindings: false,
        // Fresh secrets per run: tests never share one with `.dev.vars` or a deployment.
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
            INVITE_CODE_KEY: `${randomUUID()}${randomUUID()}`,
            EXPORT_URL_KEY: `${randomUUID()}${randomUUID()}`,
            // The safety desk's moderators (a secret in each environment), as JSON.
            MODERATORS: JSON.stringify({
              'ana@example.com': 'senior',
              'kofi@example.com': 'senior',
              'sam@example.com': 'moderator',
            }),
            MEDIA_SIGNING_KEY: `${randomUUID()}${randomUUID()}`,
            // The purchases webhooks' secrets, fixed so the tests can sign as the senders do.
            REVENUECAT_WEBHOOK_AUTH: 'Bearer rc-test-webhook-auth',
            STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
            // The fire room's LiveKit key pair; the room service itself is stood in for.
            LIVEKIT_API_KEY: 'APItest',
            LIVEKIT_API_SECRET: `${randomUUID()}${randomUUID()}`,
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
