import { defineConfig } from 'vitest/config';

// The end-to-end runs against `wrangler dev`: one file at a time, in order, with time for a real
// server. Features keep their own runs beside their code.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts', 'src/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
