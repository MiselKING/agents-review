import { setTimeout as delay } from 'node:timers/promises';

import { createDb } from '@agents-review/db';
import { requireEnv } from '@agents-review/shared/env';

import { createDestination } from './destination.ts';
import { DEFAULT_POLICY } from './policy.ts';
import type { WorkerDeps } from './process-run.ts';
import { readSettings, type WorkerSettings } from './settings.ts';
import { runWorker } from './worker.ts';

const STOP_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

/** Where stop signals come from: `process`, or an EventEmitter in tests. */
export interface SignalSource {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

export interface MainOptions {
  env?: Record<string, string | undefined>;
  signals?: SignalSource;
  log?: (line: string) => void;
  logError?: (line: string) => void;
  /** Tests replace the loop to check the wiring without touching the database. */
  run?: (deps: WorkerDeps) => Promise<void>;
}

/** Waits `ms`, ending early (without an error) when `signal` aborts. */
export const sleep = (ms: number, signal: AbortSignal) =>
  delay(ms, undefined, { signal }).catch(() => undefined);

/** Starts the worker and resolves with the exit code once it has stopped. */
export async function main({
  env = process.env,
  signals = process,
  log = console.log,
  logError = console.error,
  run = runWorker,
}: MainOptions = {}): Promise<number> {
  let settings: WorkerSettings;
  let databaseUrl: string;
  try {
    settings = readSettings(env);
    databaseUrl = requireEnv('DATABASE_URL', env);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const { db, pool } = createDb(databaseUrl);
  const controller = new AbortController();
  const stop = (signal: string) => () => {
    log(`Sync worker stopping (${signal}); finishing the request in flight`);
    controller.abort();
  };
  const handlers = STOP_SIGNALS.map((signal) => [signal, stop(signal)] as const);
  for (const [signal, handler] of handlers) signals.once(signal, handler);

  log(`Sync worker started, sending to ${settings.destinationUrl.origin}`);
  try {
    await run({
      db,
      destination: createDestination(settings.destinationUrl, {
        timeoutMs: DEFAULT_POLICY.requestTimeoutMs,
      }),
      policy: DEFAULT_POLICY,
      sleep,
      random: Math.random,
      now: () => new Date(),
      log,
      signal: controller.signal,
    });
  } finally {
    for (const [signal, handler] of handlers) signals.off(signal, handler);
    await pool.end();
  }
  log('Sync worker stopped');
  return 0;
}
