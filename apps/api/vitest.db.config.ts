import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

// Tests that need a migrated Postgres. Loads the repo-root .env (real env vars win).
const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  // Vitest's defaults plus "module". Without it our code gets graphql's CommonJS copy and Yoga the
  // ES module copy: two GraphQLError classes, so Yoga masks the errors we throw.
  environments: { ssr: { resolve: { conditions: ['module', 'node', 'development'] } } },
  test: {
    include: ['src/**/*.db.test.ts'],
    // Tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
