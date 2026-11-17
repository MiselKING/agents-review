import { setTimeout as sleep } from 'node:timers/promises';

import { createDb } from '@agents-review/db';

import { E2E_PREFIX } from './helpers';

const RUNNING_WAIT_MS = 60_000;

const ofE2eAudiences = `audience_id in (select id from audiences where name like '${E2E_PREFIX}%')`;

/** Deletes every audience the e2e tests made, this run's and leftovers, with its sync runs. */
export default async function globalTeardown() {
  const { pool } = createDb();
  try {
    const deadline = Date.now() + RUNNING_WAIT_MS;
    while (Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop
      const { rowCount } = await pool.query(
        `select 1 from sync_runs where status = 'running' and ${ofE2eAudiences} limit 1`,
      );
      if (!rowCount) break;
      // oxlint-disable-next-line no-await-in-loop
      await sleep(500);
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      // A run the worker claims meanwhile is running by the time this delete sees it, so it stays.
      await client.query(`delete from sync_runs where status <> 'running' and ${ofE2eAudiences}`);
      await client.query(
        `delete from audiences a where name like '${E2E_PREFIX}%'
           and not exists (select 1 from sync_runs r where r.audience_id = a.id)`,
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const { rowCount: left } = await pool.query(
      `select 1 from audiences where name like '${E2E_PREFIX}%'`,
    );
    if (left) {
      console.log(
        `E2E cleanup: kept ${left} audience(s) with a sync still running; the next run removes them.`,
      );
    }
  } finally {
    await pool.end();
  }
}
