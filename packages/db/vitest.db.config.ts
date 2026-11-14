import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

// Tests that need a migrated Postgres. Loads the repo-root .env (real env vars win).
const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    // The seed test truncates tables the other tests write to.
    fileParallelism: false,
  },
});
