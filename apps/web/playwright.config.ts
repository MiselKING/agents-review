import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readPort } from '@agents-review/shared/env';
import { defineConfig, devices } from '@playwright/test';

// Same ports as `pnpm dev`: load the repo-root .env (real env vars win).
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const webPort = readPort('WEB_PORT');
const apiPort = readPort('API_PORT');
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Playwright starts the API and the web app itself, or reuses running ones locally.
  webServer: [
    {
      command: 'pnpm --filter @agents-review/api start',
      url: `http://localhost:${apiPort}/graphql`,
      reuseExistingServer: !isCI,
    },
    {
      command: 'pnpm dev',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !isCI,
    },
  ],
});
