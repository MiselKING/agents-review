import { setTimeout as delay } from 'node:timers/promises';

import { createDb } from '@agents-review/db';

import { createDestination } from './destination.ts';
import { DEFAULT_POLICY } from './policy.ts';
import { readSettings, type WorkerSettings } from './settings.ts';
import { runWorker } from './worker.ts';

let settings: WorkerSettings;
try {
  settings = readSettings();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { db, pool } = createDb();
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(`Sync worker stopping (${signal}); finishing the request in flight`);
    controller.abort();
  });
}

console.log(`Sync worker started, sending to ${settings.destinationUrl.origin}`);
await runWorker({
  db,
  destination: createDestination(settings.destinationUrl, {
    timeoutMs: DEFAULT_POLICY.requestTimeoutMs,
  }),
  policy: DEFAULT_POLICY,
  sleep: (ms, signal) => delay(ms, undefined, { signal }).catch(() => undefined),
  random: Math.random,
  now: () => new Date(),
  log: (line) => console.log(line),
  signal: controller.signal,
});
await pool.end();
console.log('Sync worker stopped');
