import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest's defaults plus "module". Without it our code gets graphql's CommonJS copy and Yoga the
  // ES module copy: two GraphQLError classes, so Yoga masks the errors we throw.
  environments: { ssr: { resolve: { conditions: ['module', 'node', 'development'] } } },
  test: {
    include: ['src/**/*.test.ts'],
    // *.db.test.ts need Postgres; they run with `pnpm test:db`.
    exclude: ['src/**/*.db.test.ts'],
  },
});
