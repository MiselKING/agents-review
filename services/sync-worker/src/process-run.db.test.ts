import { createDb } from '@agents-review/db';
import { claimSyncRun, snapshotSyncRun } from '@agents-review/db/sync-runs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createDestination } from './destination.ts';
import { DEFAULT_POLICY } from './policy.ts';
import { processRun, type WorkerDeps } from './process-run.ts';
import { type FakePlatform, type Step, startFakePlatform } from './test/fake-platform.ts';

const { db, pool } = createDb();
afterAll(() => pool.end());

const created = { audiences: [] as number[], countries: [] as string[] };
const platforms: FakePlatform[] = [];

afterEach(async () => {
  await Promise.all(platforms.splice(0).map((platform) => platform.close()));
  await pool.query('delete from sync_runs where audience_id = any($1::bigint[])', [
    created.audiences,
  ]);
  await pool.query('delete from audiences where id = any($1::bigint[])', [created.audiences]);
  await pool.query('delete from customers where country = any($1::text[])', [created.countries]);
  created.audiences = [];
  created.countries = [];
});

const BATCH_SIZE = 100;

const firstRow = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('Query returned no row.');
  return row;
};

/** An audience of `size` new customers in a country no seeded customer has, and its claimed run. */
async function audienceWithRun(size: number) {
  const country = `Q${String.fromCodePoint(65 + Math.floor(Math.random() * 26))}${String.fromCodePoint(65 + Math.floor(Math.random() * 26))}`;
  await pool.query('delete from customers where country = $1', [country]);
  created.countries.push(country);
  const prefix = `sync-${country.toLowerCase()}-${Date.now()}-`;
  const customers = await pool.query<{ id: string }>(
    `insert into customers (email, first_name, last_name, country)
     select $1 || g || '@example.com', 'Sync', 'Test', $2 from generate_series(1, $3::int) g
     returning id`,
    [prefix, country, size],
  );
  const definition = {
    version: 1,
    match: 'all',
    conditions: [{ kind: 'attribute', field: 'country', operator: 'is', value: country }],
  };
  const audience = firstRow(
    (
      await pool.query<{ id: string }>(
        'insert into audiences (name, definition) values ($1, $2::jsonb) returning id',
        [`Sync test ${country}`, JSON.stringify(definition)],
      )
    ).rows,
  );
  const audienceId = Number(audience.id);
  created.audiences.push(audienceId);
  // Created already claimed, so a worker running under `pnpm dev` never takes it.
  const run = firstRow(
    (
      await pool.query<{ id: string }>(
        `insert into sync_runs (audience_id, status, started_at, heartbeat_at)
         values ($1, 'running', now(), now()) returning id`,
        [audienceId],
      )
    ).rows,
  );
  const customerIds = customers.rows.map((row) => row.id).toSorted((a, b) => Number(a) - Number(b));
  return { audienceId, runId: Number(run.id), customerIds, country };
}

async function startPlatform(script: Step[] = []) {
  const platform = await startFakePlatform(script);
  platforms.push(platform);
  return platform;
}

// Only tests where the platform hangs need a short deadline; a busy CI runner can be slower than one.
function workerFor(platform: FakePlatform, timeoutMs = 2_000) {
  const sleeps: number[] = [];
  const lines: string[] = [];
  const controller = new AbortController();
  const deps: WorkerDeps = {
    db,
    destination: createDestination(platform.url, { timeoutMs }),
    policy: { ...DEFAULT_POLICY, batchSize: BATCH_SIZE, requestTimeoutMs: timeoutMs },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    now: () => new Date(),
    log: (line) => lines.push(line),
    signal: controller.signal,
  };
  return { deps, sleeps, lines, controller };
}

async function runRow(runId: number) {
  const result = await pool.query<{
    status: string;
    member_count: number;
    synced_count: number;
    failed_count: number;
    error: string | null;
    finished_at: Date | null;
  }>(
    'select status, member_count, synced_count, failed_count, error, finished_at from sync_runs where id = $1',
    [runId],
  );
  return firstRow(result.rows);
}

async function batchRows(runId: number) {
  const result = await pool.query<{
    batch_index: number;
    status: string;
    attempts: number;
    idempotency_key: string;
    size: number;
    last_error: string | null;
  }>(
    `select batch_index, status, attempts, idempotency_key, cardinality(customer_ids) as size, last_error
     from sync_batches where run_id = $1 order by batch_index`,
    [runId],
  );
  return result.rows;
}

describe('processRun', () => {
  it('sends every member exactly once, in batches of at most the batch size, and succeeds', async () => {
    const platform = await startPlatform();
    const { audienceId, runId, customerIds } = await audienceWithRun(250);
    const { deps } = workerFor(platform);

    expect(await processRun(deps, runId)).toBe('finished');

    expect(platform.stored(String(audienceId))).toEqual(customerIds);
    expect(platform.requests.map((request) => request.memberIds.length)).toEqual([100, 100, 50]);
    const run = await runRow(runId);
    expect(run).toMatchObject({
      status: 'succeeded',
      member_count: 250,
      synced_count: 250,
      failed_count: 0,
      error: null,
    });
    expect(run.finished_at).toBeInstanceOf(Date);
  });

  it('sends the members of the audience as it was when the run started', async () => {
    const platform = await startPlatform();
    const { audienceId, runId, customerIds } = await audienceWithRun(30);
    await snapshotSyncRun(db, runId, BATCH_SIZE, new Date());
    await pool.query(
      `update audiences set definition = jsonb_set(definition, '{conditions,0,value}', '"DEU"') where id = $1`,
      [audienceId],
    );

    await processRun(workerFor(platform).deps, runId);
    expect(platform.stored(String(audienceId))).toEqual(customerIds);
  });

  it('retries server errors, timeouts and network errors with the same key and growing waits', async () => {
    const platform = await startPlatform(['fail-before', 'fail-after', 'drop', 'hang', 'ok']);
    const { audienceId, runId, customerIds } = await audienceWithRun(40);
    const { deps, sleeps } = workerFor(platform, 300);

    await processRun(deps, runId);

    const [batch] = await batchRows(runId);
    expect(platform.requests).toHaveLength(5);
    expect(new Set(platform.requests.map((request) => request.key))).toEqual(
      new Set([batch?.idempotency_key]),
    );
    expect(platform.stored(String(audienceId))).toEqual(customerIds);
    // Jitter with random() = 0.5 adds 125 ms to each wait.
    expect(sleeps).toEqual([1125, 2125, 4125, 8125]);
    expect(batch).toMatchObject({ status: 'sent', attempts: 5, last_error: null });
    expect((await runRow(runId)).status).toBe('succeeded');
  });

  it('fails a batch after 5 attempts, still sends the others, and fails the run with a summary', async () => {
    const platform = await startPlatform(Array.from({ length: 5 }, () => 'fail-before' as const));
    const { audienceId, runId, customerIds } = await audienceWithRun(150);
    await processRun(workerFor(platform).deps, runId);

    expect(platform.requests).toHaveLength(6);
    expect(platform.stored(String(audienceId))).toEqual(customerIds.slice(100));
    expect(await batchRows(runId)).toMatchObject([
      { status: 'failed', attempts: 5, last_error: 'HTTP 500: Internal error.' },
      { status: 'sent', attempts: 1 },
    ]);
    expect(await runRow(runId)).toMatchObject({
      status: 'failed',
      member_count: 150,
      synced_count: 50,
      failed_count: 100,
      error: '1 of 2 batches failed. First error: HTTP 500: Internal error.',
    });
  });

  it('fails a batch the platform rejects without retrying it', async () => {
    const platform = await startPlatform([{ status: 400, error: 'members[0].email is invalid.' }]);
    const { runId } = await audienceWithRun(150);
    const { deps, sleeps } = workerFor(platform);
    await processRun(deps, runId);

    expect(platform.requests).toHaveLength(2);
    expect(sleeps).toEqual([]);
    expect(await batchRows(runId)).toMatchObject([
      { status: 'failed', attempts: 1, last_error: 'HTTP 400: members[0].email is invalid.' },
      { status: 'sent' },
    ]);
    expect((await runRow(runId)).status).toBe('failed');
  });

  it('waits as long as a rate limit asks, without using up an attempt', async () => {
    const platform = await startPlatform([{ status: 429, retryAfter: '3' }, 'ok']);
    const { runId } = await audienceWithRun(10);
    const { deps, sleeps } = workerFor(platform);
    await processRun(deps, runId);

    expect(sleeps).toEqual([3000]);
    expect(await batchRows(runId)).toMatchObject([{ status: 'sent', attempts: 1 }]);
  });

  it('waits a rate limit of exactly 60 s, but fails at once when asked to wait longer', async () => {
    const platform = await startPlatform([
      { status: 429, retryAfter: '60' },
      'ok',
      { status: 429, retryAfter: '3600' },
    ]);
    const { runId } = await audienceWithRun(150);
    const { deps, sleeps } = workerFor(platform);
    await processRun(deps, runId);

    expect(sleeps).toEqual([60_000]);
    expect(platform.requests).toHaveLength(3);
    expect(await batchRows(runId)).toMatchObject([
      { status: 'sent', attempts: 1 },
      {
        status: 'failed',
        attempts: 0,
        last_error: 'Rate limited for 3600 s, longer than the 60 s the worker waits.',
      },
    ]);
  });

  it('fails a batch once its rate-limit waits would pass 2 minutes in total', async () => {
    const platform = await startPlatform(
      Array.from({ length: 5 }, () => ({ status: 429, retryAfter: '30' })),
    );
    const { runId } = await audienceWithRun(10);
    const { deps, sleeps } = workerFor(platform);
    await processRun(deps, runId);

    expect(sleeps).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(platform.requests).toHaveLength(5);
    expect(await batchRows(runId)).toMatchObject([
      { status: 'failed', attempts: 0, last_error: 'Rate limited for more than 120 s in total.' },
    ]);
  });

  it('counts a resend the platform refuses as delivered when an earlier attempt reached it', async () => {
    // The platform stores the batch but answers 500; the worker stops while waiting to retry.
    const platform = await startPlatform(['fail-after']);
    const { audienceId, runId, customerIds } = await audienceWithRun(5);
    const first = workerFor(platform);
    first.deps.sleep = () => {
      first.controller.abort();
      return Promise.resolve();
    };
    expect(await processRun(first.deps, runId)).toBe('stopped');

    // A customer is deleted before the resume, so the resend differs and gets a 422.
    await pool.query('delete from customers where id = $1', [customerIds[0]]);
    const second = workerFor(platform);
    await processRun(second.deps, runId);

    expect(platform.requests.map((request) => request.memberIds.length)).toEqual([5, 4]);
    expect(platform.stored(String(audienceId))).toEqual(customerIds);
    expect(await batchRows(runId)).toMatchObject([
      { status: 'sent', attempts: 2, last_error: null },
    ]);
    expect(await runRow(runId)).toMatchObject({ status: 'succeeded', synced_count: 5 });
  });

  it('fails a batch whose key is refused on its very first attempt', async () => {
    const platform = await startPlatform([{ status: 422, error: 'Key already used.' }]);
    const { runId } = await audienceWithRun(5);
    const { deps, sleeps } = workerFor(platform);
    await processRun(deps, runId);

    expect(sleeps).toEqual([]);
    expect(await batchRows(runId)).toMatchObject([
      { status: 'failed', attempts: 1, last_error: 'HTTP 422: Key already used.' },
    ]);
  });

  it('leaves out emails the platform would refuse and sends the rest of the batch', async () => {
    const platform = await startPlatform();
    const { audienceId, runId, customerIds } = await audienceWithRun(3);
    await pool.query(`update customers set email = 'not an email' where id = $1`, [customerIds[1]]);
    const { deps, lines } = workerFor(platform);
    await processRun(deps, runId);

    expect(platform.stored(String(audienceId))).toEqual([customerIds[0], customerIds[2]]);
    expect(lines).toContain(`run ${runId} batch 0: members left out for an invalid email: 1`);
    expect((await runRow(runId)).status).toBe('succeeded');
  });

  it('succeeds with all counts at 0 for an audience with no members', async () => {
    const platform = await startPlatform();
    const { runId } = await audienceWithRun(0);
    await processRun(workerFor(platform).deps, runId);

    expect(platform.requests).toEqual([]);
    expect(await runRow(runId)).toMatchObject({
      status: 'succeeded',
      member_count: 0,
      synced_count: 0,
      failed_count: 0,
    });
  });

  it('leaves out customers deleted after the snapshot', async () => {
    const platform = await startPlatform();
    const { audienceId, runId, customerIds } = await audienceWithRun(5);
    await snapshotSyncRun(db, runId, BATCH_SIZE, new Date());
    await pool.query('delete from customers where id = $1', [customerIds[0]]);

    await processRun(workerFor(platform).deps, runId);
    expect(platform.stored(String(audienceId))).toEqual(customerIds.slice(1));
  });

  it('resumes a run whose worker died: only unsent batches go out, with their original keys', async () => {
    const platform = await startPlatform();
    const { audienceId, runId, customerIds } = await audienceWithRun(250);
    await snapshotSyncRun(db, runId, BATCH_SIZE, new Date());
    await pool.query(
      `update sync_batches set status = 'sent', attempts = 1 where run_id = $1 and batch_index = 0`,
      [runId],
    );

    expect(await claimSyncRun(db, runId, 60)).toBeUndefined();
    await pool.query(
      `update sync_runs set heartbeat_at = now() - interval '2 minutes' where id = $1`,
      [runId],
    );
    expect(await claimSyncRun(db, runId, 60)).toMatchObject({ id: runId, status: 'running' });

    await processRun(workerFor(platform).deps, runId);

    const batches = await batchRows(runId);
    expect(platform.requests.map((request) => request.key)).toEqual(
      batches.slice(1).map((batch) => batch.idempotency_key),
    );
    expect(platform.stored(String(audienceId))).toEqual(customerIds.slice(100));
    expect(await runRow(runId)).toMatchObject({ status: 'succeeded', synced_count: 250 });
  });

  it('finishes the request in flight on a stop signal, then leaves the run to be resumed', async () => {
    const platform = await startPlatform();
    const { runId } = await audienceWithRun(250);
    const { deps, controller } = workerFor(platform);
    platform.hooks.onRequest = () => controller.abort();

    expect(await processRun(deps, runId)).toBe('stopped');

    expect(platform.requests).toHaveLength(1);
    expect((await batchRows(runId)).map((batch) => batch.status)).toEqual([
      'sent',
      'pending',
      'pending',
    ]);
    expect((await runRow(runId)).status).toBe('running');
  });

  it('stops during a retry wait, then resumes with the attempts left and the rest of the wait', async () => {
    const platform = await startPlatform(Array.from({ length: 5 }, () => 'fail-before' as const));
    const { runId } = await audienceWithRun(10);

    const first = workerFor(platform);
    first.deps.sleep = (ms) => {
      first.sleeps.push(ms);
      if (first.sleeps.length === 2) first.controller.abort();
      return Promise.resolve();
    };
    expect(await processRun(first.deps, runId)).toBe('stopped');
    expect(await batchRows(runId)).toMatchObject([{ status: 'pending', attempts: 2 }]);

    const second = workerFor(platform);
    await processRun(second.deps, runId);

    expect(platform.requests).toHaveLength(5);
    const [resumeWait = 0, ...retryWaits] = second.sleeps;
    expect(resumeWait).toBeGreaterThan(1000);
    expect(resumeWait).toBeLessThanOrEqual(2125);
    expect(retryWaits).toEqual([4125, 8125]);
    expect(await batchRows(runId)).toMatchObject([{ status: 'failed', attempts: 5 }]);
  });

  it('keeps the run’s heartbeat fresh while it works, and stops it afterwards', async () => {
    const platform = await startPlatform(['hang', 'ok']);
    const { runId } = await audienceWithRun(10);
    await pool.query(
      `update sync_runs set heartbeat_at = now() - interval '30 seconds' where id = $1`,
      [runId],
    );
    const { deps } = workerFor(platform, 300);
    deps.policy = { ...deps.policy, heartbeatMs: 50 };
    const heartbeat = async () =>
      firstRow(
        (
          await pool.query<{ heartbeat_at: Date; age_ms: string }>(
            `select heartbeat_at, extract(epoch from clock_timestamp() - heartbeat_at) * 1000 as age_ms
             from sync_runs where id = $1`,
            [runId],
          )
        ).rows,
      );

    await processRun(deps, runId);
    const after = await heartbeat();
    expect(Number(after.age_ms)).toBeLessThan(1000);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await heartbeat()).heartbeat_at).toEqual(after.heartbeat_at);
  });

  it('waits for a heartbeat write still in flight before it returns', async () => {
    const platform = await startPlatform(['hang']);
    const { runId } = await audienceWithRun(10);
    // Snapshot first, so from here on only heartbeats write to the run's row.
    await snapshotSyncRun(db, runId, BATCH_SIZE, new Date());
    const { deps, controller } = workerFor(platform, 300);
    deps.policy = { ...deps.policy, heartbeatMs: 50 };
    platform.hooks.onRequest = () => controller.abort();
    const heartbeatAt = async () =>
      firstRow(
        (
          await pool.query<{ heartbeat_at: Date }>(
            'select heartbeat_at from sync_runs where id = $1',
            [runId],
          )
        ).rows,
      ).heartbeat_at;
    const before = await heartbeatAt();

    // Holding the row lock makes each heartbeat write wait until the lock is released.
    const lock = await pool.connect();
    await lock.query('begin');
    await lock.query('select id from sync_runs where id = $1 for update', [runId]);
    const released = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await lock.query('commit');
      lock.release();
    })();

    expect(await processRun(deps, runId)).toBe('stopped');
    const returned = await heartbeatAt();
    await released;
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(returned.getTime()).toBeGreaterThan(before.getTime());
    expect(await heartbeatAt()).toEqual(returned);
  });

  it('still syncs an audience archived after its run started', async () => {
    const platform = await startPlatform();
    const { audienceId, runId, customerIds } = await audienceWithRun(5);
    await pool.query('update audiences set archived_at = now() where id = $1', [audienceId]);

    await processRun(workerFor(platform).deps, runId);
    expect(platform.stored(String(audienceId))).toEqual(customerIds);
    expect((await runRow(runId)).status).toBe('succeeded');
  });

  it('never logs email addresses', async () => {
    const platform = await startPlatform([
      'fail-after',
      { status: 400, error: 'Rejected member ann@example.com.' },
    ]);
    const { runId } = await audienceWithRun(150);
    const { deps, lines } = workerFor(platform);
    await processRun(deps, runId);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('@');
    const batches = await batchRows(runId);
    expect(batches.map((batch) => batch.last_error).join(' ')).not.toContain('@');
  });
});

describe('claimSyncRun', () => {
  it('lets only one of two workers claim the same run', async () => {
    const { runId } = await audienceWithRun(1);
    await pool.query(
      `update sync_runs set heartbeat_at = now() - interval '2 minutes' where id = $1`,
      [runId],
    );
    const claims = await Promise.all([claimSyncRun(db, runId, 60), claimSyncRun(db, runId, 60)]);
    expect(claims.filter((claim) => claim !== undefined)).toHaveLength(1);
  });
});
