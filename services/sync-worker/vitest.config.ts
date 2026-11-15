import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // *.db.test.ts need Postgres; they run with `pnpm test:db`.
    exclude: ['src/**/*.db.test.ts'],
  },
});
