import { defineConfig } from 'vitest/config';

/** The golden scenes against headless Chrome: `pnpm --filter @kithfield/art golden`. */
export default defineConfig({
  test: { include: ['src/golden/**/*.test.ts'], testTimeout: 600_000, hookTimeout: 120_000 },
});
