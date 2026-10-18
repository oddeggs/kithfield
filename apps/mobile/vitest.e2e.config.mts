import { defineConfig } from 'vitest/config';

// The end-to-end run against `wrangler dev`: one file, in order, with time for a real server.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
