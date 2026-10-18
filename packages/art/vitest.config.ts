import { configDefaults, defineConfig } from 'vitest/config';

// The golden scenes need Chromium, so they run on their own (`pnpm golden`, its own CI job).
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'src/golden/**'] },
});
