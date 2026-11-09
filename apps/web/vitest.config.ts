import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests don't need ports from .env.
// Playwright specs in e2e/ are run by `pnpm test:e2e`, not Vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
