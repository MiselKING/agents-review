// Runs before `drizzle-kit migrate`. `docker compose up -d` returns before Postgres
// accepts connections, so wait for it instead of failing on the first try.
import { setTimeout as sleep } from 'node:timers/promises';

import { requireEnv } from '@agents-review/shared/env';
import { Client } from 'pg';

import { describeDatabaseUrl, findPortMismatch } from './url.ts';

const TIMEOUT_MS = 30_000;
const RETRY_MS = 1_000;

const databaseUrl = requireEnv('DATABASE_URL');
const target = describeDatabaseUrl(databaseUrl);

const mismatch = findPortMismatch(databaseUrl, process.env.POSTGRES_PORT);
if (mismatch) {
  console.error(mismatch);
  process.exit(1);
}

const deadline = Date.now() + TIMEOUT_MS;
// Retries must run one after another, so awaiting inside the loop is the point here.
/* oxlint-disable no-await-in-loop */
for (;;) {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.end();
    console.log(`Database is ready at ${target}`);
    break;
  } catch (error) {
    await client.end().catch(() => {});
    if (Date.now() >= deadline) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`Database at ${target} not reachable after ${TIMEOUT_MS / 1000}s: ${reason}`);
      console.error('Is Postgres running? Start it with `docker compose up -d`.');
      process.exit(1);
    }
    await sleep(RETRY_MS);
  }
}
/* oxlint-enable no-await-in-loop */
