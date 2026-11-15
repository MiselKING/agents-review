import { createDb } from '@agents-review/db';
import { inRollback, type Tx } from '@agents-review/db/rollback';
import { afterAll, describe, expect, it } from 'vitest';

import { at, graphqlClient } from './test/graphql.ts';
import { createApi } from './yoga.ts';

const { db, pool } = createDb();
afterAll(() => pool.end());

/**
 * Runs `test` against an API on a transaction that is rolled back afterwards. The queued runs
 * stay invisible to a worker running under `pnpm dev`, and nothing is left behind.
 */
function withApi(test: (gql: ReturnType<typeof graphqlClient>, tx: Tx) => Promise<void>) {
  return inRollback(db, (tx) => test(graphqlClient(createApi(tx)), tx));
}

const RUN_FIELDS = `
  id status memberCount syncedCount failedCount error createdAt startedAt finishedAt
  audience { id name }
`;
const START = `mutation ($audienceId: ID!) { startSync(audienceId: $audienceId) { ${RUN_FIELDS} } }`;
const RUN = `query ($id: ID!) { syncRun(id: $id) { ${RUN_FIELDS} } }`;
const RUNS = `query ($audienceId: ID, $first: Int, $after: String) {
  syncRuns(audienceId: $audienceId, first: $first, after: $after) {
    nodes { id }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function createAudience(gql: ReturnType<typeof graphqlClient>, name: string) {
  const body = await gql(
    `mutation ($input: CreateAudienceInput!) { createAudience(input: $input) { id } }`,
    {
      input: {
        name,
        definition: {
          match: 'ALL',
          conditions: [{ attribute: { field: 'COUNTRY', operator: 'IS', value: 'DEU' } }],
        },
      },
    },
  );
  const id = at(body, 'data', 'createAudience', 'id');
  if (typeof id !== 'string') throw new Error(`Audience not created: ${JSON.stringify(body)}`);
  return id;
}

async function startSync(gql: ReturnType<typeof graphqlClient>, audienceId: string) {
  const body = await gql(START, { audienceId });
  const id = at(body, 'data', 'startSync', 'id');
  if (typeof id !== 'string') throw new Error(`Sync not started: ${JSON.stringify(body)}`);
  return { id, run: at(body, 'data', 'startSync') };
}

const errorCode = (body: unknown) => at(body, 'errors', 0, 'extensions', 'code');

describe('startSync', () => {
  it('queues a run and returns it', () =>
    withApi(async (gql) => {
      const audienceId = await createAudience(gql, 'Sync API start');
      const { run } = await startSync(gql, audienceId);
      expect(run).toMatchObject({
        status: 'QUEUED',
        memberCount: 0,
        syncedCount: 0,
        failedCount: 0,
        error: null,
        startedAt: null,
        finishedAt: null,
        audience: { id: audienceId, name: 'Sync API start' },
      });
      expect(at(run, 'createdAt')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }));

  it('refuses a second sync while one is queued or running, creating no second run', () =>
    withApi(async (gql, tx) => {
      const audienceId = await createAudience(gql, 'Sync API busy');
      const { id } = await startSync(gql, audienceId);

      const queued = await gql(START, { audienceId });
      expect(errorCode(queued)).toBe('SYNC_IN_PROGRESS');
      expect(at(queued, 'errors', 0, 'message')).toBe(
        'A sync of this audience is already queued or running.',
      );

      await tx.execute(`update sync_runs set status = 'running' where id = ${Number(id)}`);
      expect(errorCode(await gql(START, { audienceId }))).toBe('SYNC_IN_PROGRESS');

      const runs = at(await gql(RUNS, { audienceId }), 'data', 'syncRuns', 'nodes');
      expect(runs).toEqual([{ id }]);
    }));

  it('allows a new sync once the previous one finished', () =>
    withApi(async (gql, tx) => {
      const audienceId = await createAudience(gql, 'Sync API again');
      const { id } = await startSync(gql, audienceId);
      await tx.execute(`update sync_runs set status = 'succeeded' where id = ${Number(id)}`);
      expect((await startSync(gql, audienceId)).id).not.toBe(id);
    }));

  it.each(['999999999999', 'abc'])('refuses unknown audience %s', (audienceId) =>
    withApi(async (gql) => {
      expect(errorCode(await gql(START, { audienceId }))).toBe('NOT_FOUND');
    }),
  );

  it('refuses an archived audience', () =>
    withApi(async (gql) => {
      const audienceId = await createAudience(gql, 'Sync API archived');
      await gql('mutation ($id: ID!) { archiveAudience(id: $id) { id } }', { id: audienceId });
      expect(errorCode(await gql(START, { audienceId }))).toBe('NOT_FOUND');
    }));
});

describe('syncRuns and syncRun', () => {
  it('lists an audience’s runs newest first, in pages', () =>
    withApi(async (gql, tx) => {
      const audienceId = await createAudience(gql, 'Sync API list');
      const ids: string[] = [];
      for (let count = 0; count < 3; count += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each run must finish before the next starts
        const { id } = await startSync(gql, audienceId);
        ids.push(id);
        // oxlint-disable-next-line no-await-in-loop
        await tx.execute(`update sync_runs set status = 'failed' where id = ${Number(id)}`);
      }
      const newestFirst = ids.toReversed().map((id) => ({ id }));

      const all = at(await gql(RUNS, { audienceId }), 'data', 'syncRuns');
      expect(at(all, 'nodes')).toEqual(newestFirst);
      expect(at(all, 'pageInfo', 'hasNextPage')).toBe(false);

      const first = at(await gql(RUNS, { audienceId, first: 2 }), 'data', 'syncRuns');
      expect(at(first, 'nodes')).toEqual(newestFirst.slice(0, 2));
      expect(at(first, 'pageInfo', 'hasNextPage')).toBe(true);
      const after = at(first, 'pageInfo', 'endCursor');
      const rest = at(await gql(RUNS, { audienceId, after }), 'data', 'syncRuns', 'nodes');
      expect(rest).toEqual(newestFirst.slice(2));
    }));

  it('includes every audience’s runs when no audience is given', () =>
    withApi(async (gql) => {
      const one = await startSync(gql, await createAudience(gql, 'Sync API all 1'));
      const two = await startSync(gql, await createAudience(gql, 'Sync API all 2'));
      const nodes = at(await gql(RUNS, { first: 100 }), 'data', 'syncRuns', 'nodes');
      if (!Array.isArray(nodes)) throw new Error('No nodes.');
      const ids = nodes.map((node: unknown) => at(node, 'id'));
      expect(ids.indexOf(two.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(two.id)).toBeLessThan(ids.indexOf(one.id));
    }));

  it.each(['999999999999', 'abc'])('lists no runs for unknown audience %s', (audienceId) =>
    withApi(async (gql) => {
      expect(at(await gql(RUNS, { audienceId }), 'data', 'syncRuns')).toEqual({
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      });
    }),
  );

  it('rejects a page size above 100', () =>
    withApi(async (gql) => {
      expect(errorCode(await gql(RUNS, { first: 101 }))).toBe('BAD_USER_INPUT');
    }));

  it('loads a run by id, still naming its audience once that is archived', () =>
    withApi(async (gql) => {
      const audienceId = await createAudience(gql, 'Sync API load');
      const { id, run } = await startSync(gql, audienceId);
      await gql('mutation ($id: ID!) { archiveAudience(id: $id) { id } }', { id: audienceId });
      expect(at(await gql(RUN, { id }), 'data', 'syncRun')).toEqual(run);
    }));

  it.each(['999999999999', 'abc'])('returns null for unknown run %s', (id) =>
    withApi(async (gql) => {
      expect(at(await gql(RUN, { id }), 'data', 'syncRun')).toBeNull();
    }),
  );
});
