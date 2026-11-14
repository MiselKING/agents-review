import { createDb } from '@agents-review/db';
import { afterAll, describe, expect, it } from 'vitest';

import { createApi } from './yoga.ts';

const { db, pool } = createDb();
const api = createApi(db);
const createdIds: string[] = [];

afterAll(async () => {
  await pool.query('delete from audiences where id = any($1::bigint[])', [createdIds]);
  await pool.end();
});

interface GqlResponse {
  data?: unknown;
  errors?: { message: string; extensions?: { code?: unknown } }[];
}

const isGqlResponse = (value: unknown): value is GqlResponse =>
  typeof value === 'object' && value !== null && ('data' in value || 'errors' in value);

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<GqlResponse> {
  const response = await api.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body: unknown = await response.json();
  if (!isGqlResponse(body)) throw new Error(`Not a GraphQL response: ${JSON.stringify(body)}`);
  return body;
}

/** Reads a nested value, like at(body, 'data', 'audience', 'id'). */
function at(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    const next: unknown = Reflect.get(current, key);
    current = next;
  }
  return current;
}

function idsOf(connection: unknown): number[] {
  const nodes = at(connection, 'nodes');
  if (!Array.isArray(nodes)) throw new Error('No nodes in the connection.');
  return nodes.map((node: unknown) => Number(at(node, 'id')));
}

/** Runs a `select count(*)::int as n ...` query. */
async function count(query: string, values: unknown[] = []): Promise<number> {
  const result = await pool.query<{ n: number }>(query, values);
  return result.rows[0]?.n ?? 0;
}

async function customerIds(country: string): Promise<number[]> {
  const result = await pool.query<{ id: string }>(
    'select id from customers where country = $1 order by id',
    [country],
  );
  return result.rows.map((row) => Number(row.id));
}

const AUDIENCE_FIELDS = `
  id name memberCount createdAt updatedAt
  definition {
    version match
    conditions {
      __typename
      ... on AttributeCondition { field operator value }
      ... on SignedUpCondition { operator window { amount unit } }
      ... on EventCondition { eventType operator window { amount unit } }
    }
  }
`;

const CREATE = `mutation ($input: CreateAudienceInput!) {
  createAudience(input: $input) { ${AUDIENCE_FIELDS} }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateAudienceInput!) {
  updateAudience(id: $id, input: $input) { ${AUDIENCE_FIELDS} }
}`;
const ARCHIVE = `mutation ($id: ID!) { archiveAudience(id: $id) { id } }`;
const LOAD = `query ($id: ID!) { audience(id: $id) { ${AUDIENCE_FIELDS} } }`;
const LIST = `{ audiences { id } }`;
const MEMBERS = `query ($id: ID!, $first: Int, $after: String) {
  audience(id: $id) {
    memberCount
    members(first: $first, after: $after) { nodes { id email firstName lastName country } pageInfo { hasNextPage endCursor } }
  }
}`;
const PREVIEW = `query ($definition: AudienceFilterInput!, $first: Int, $after: String) {
  previewAudience(definition: $definition, first: $first, after: $after) {
    memberCount
    members { nodes { id } pageInfo { hasNextPage endCursor } }
  }
}`;

const countryFilter = (value: string) => ({
  match: 'ALL',
  conditions: [{ attribute: { field: 'COUNTRY', operator: 'IS', value } }],
});

const everyKindFilter = {
  version: 1,
  match: 'ANY',
  conditions: [
    { attribute: { field: 'COUNTRY', operator: 'IS', value: 'DEU' } },
    { signedUp: { operator: 'WITHIN_LAST', window: { amount: 12, unit: 'MONTH' } } },
    {
      event: {
        eventType: 'purchase',
        operator: 'NOT_PERFORMED',
        window: { amount: 30, unit: 'DAY' },
      },
    },
  ],
};

const testName = (label: string) => `API test ${label} ${Date.now()}-${Math.random()}`;

async function create(name: string, definition: unknown): Promise<string> {
  const body = await gql(CREATE, { input: { name, definition } });
  const id = at(body, 'data', 'createAudience', 'id');
  if (typeof id !== 'string') throw new Error(`Create failed: ${JSON.stringify(body.errors)}`);
  createdIds.push(id);
  return id;
}

const audiencesNamed = async (name: string) =>
  count('select count(*)::int as n from audiences where name = $1', [name]);

describe('creating and loading', () => {
  it('returns the new audience, lists it and loads it by id', async () => {
    const name = testName('create');
    const body = await gql(CREATE, { input: { name: `  ${name}  `, definition: everyKindFilter } });
    const created = at(body, 'data', 'createAudience');
    const id = at(created, 'id');
    if (typeof id !== 'string') throw new Error(JSON.stringify(body.errors));
    createdIds.push(id);

    expect(created).toMatchObject({ name, definition: { version: 1, match: 'ANY' } });
    expect(at(created, 'createdAt')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const list = at(await gql(LIST), 'data', 'audiences');
    expect(list).toEqual(expect.arrayContaining([{ id }]));
    expect(at(await gql(LOAD, { id }), 'data', 'audience')).toEqual(created);
  });

  it('reads back the filter exactly as it was saved', async () => {
    const id = await create(testName('round trip'), everyKindFilter);
    const definition = at(await gql(LOAD, { id }), 'data', 'audience', 'definition');
    expect(definition).toEqual({
      version: 1,
      match: 'ANY',
      conditions: [
        { __typename: 'AttributeCondition', ...everyKindFilter.conditions[0]?.attribute },
        { __typename: 'SignedUpCondition', ...everyKindFilter.conditions[1]?.signedUp },
        { __typename: 'EventCondition', ...everyKindFilter.conditions[2]?.event },
      ],
    });
  });

  it('stores a name with quotes and SQL as plain text', async () => {
    const name = `Robert'); drop table customers; -- "${Date.now()}"`;
    const customersBefore = await count('select count(*)::int as n from customers');
    const id = await create(name, countryFilter('DEU'));
    expect(at(await gql(LOAD, { id }), 'data', 'audience', 'name')).toBe(name);
    expect(await count('select count(*)::int as n from customers')).toBe(customersBefore);
  });
});

describe('updating and archiving', () => {
  it('changes the name or the filter', async () => {
    const id = await create(testName('update'), countryFilter('DEU'));
    const renamed = testName('renamed');
    const byName = await gql(UPDATE, { id, input: { name: renamed } });
    expect(at(byName, 'data', 'updateAudience', 'name')).toBe(renamed);

    const byFilter = await gql(UPDATE, { id, input: { definition: countryFilter('FRA') } });
    expect(at(byFilter, 'data', 'updateAudience')).toMatchObject({
      name: renamed,
      definition: { conditions: [{ value: 'FRA' }] },
    });
  });

  it('rejects an update with nothing to change', async () => {
    const id = await create(testName('empty update'), countryFilter('DEU'));
    const body = await gql(UPDATE, { id, input: {} });
    expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('rejects renaming to a blank name', async () => {
    const id = await create(testName('blank rename'), countryFilter('DEU'));
    const body = await gql(UPDATE, { id, input: { name: '' } });
    expect(body.errors?.[0]?.message).toMatch(/name must be 1 to 100 characters/);
  });

  it('hides an archived audience but keeps its row', async () => {
    const id = await create(testName('archive'), countryFilter('DEU'));
    expect(at(await gql(ARCHIVE, { id }), 'data', 'archiveAudience', 'id')).toBe(id);

    expect(at(await gql(LIST), 'data', 'audiences')).not.toEqual(expect.arrayContaining([{ id }]));
    expect(at(await gql(LOAD, { id }), 'data', 'audience')).toBeNull();
    expect(await count('select count(*)::int as n from audiences where id = $1', [id])).toBe(1);

    for (const mutation of [ARCHIVE, UPDATE]) {
      // oxlint-disable-next-line no-await-in-loop
      const body = await gql(mutation, { id, input: { name: 'x' } });
      expect(body.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    }
  });

  it.each(['999999999999', 'abc', '0', '-1'])('treats id %s as unknown', async (id) => {
    expect(at(await gql(LOAD, { id }), 'data', 'audience')).toBeNull();
    for (const mutation of [ARCHIVE, UPDATE]) {
      // oxlint-disable-next-line no-await-in-loop
      const body = await gql(mutation, { id, input: { name: 'x' } });
      expect(body.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    }
  });
});

describe('members', () => {
  it('counts the customers that match the filter', async () => {
    const id = await create(testName('count'), countryFilter('DEU'));
    const expected = await count("select count(*)::int as n from customers where country = 'DEU'");
    expect(at(await gql(MEMBERS, { id }), 'data', 'audience', 'memberCount')).toBe(expected);
  });

  it('pages through every member in id order, with no repeats or gaps', async () => {
    const id = await create(testName('paging'), countryFilter('SWE'));
    const expected = await customerIds('SWE');
    expect(expected.length).toBeGreaterThan(100);

    const seen: number[] = [];
    let after: unknown = null;
    for (;;) {
      // Each page needs the previous page's cursor.
      // oxlint-disable-next-line no-await-in-loop
      const body = await gql(MEMBERS, { id, first: 100, after });
      const members = at(body, 'data', 'audience', 'members');
      seen.push(...idsOf(members));
      after = at(members, 'pageInfo', 'endCursor');
      if (at(members, 'pageInfo', 'hasNextPage') !== true) break;
    }
    expect(seen).toEqual(expected);
  });

  it('returns 25 members by default with all member fields', async () => {
    const id = await create(testName('default page'), countryFilter('DEU'));
    const members = at(await gql(MEMBERS, { id }), 'data', 'audience', 'members');
    expect(idsOf(members)).toHaveLength(25);
    const first = at(members, 'nodes', 0);
    for (const field of ['id', 'email', 'firstName', 'lastName']) {
      expect(typeof at(first, field)).toBe('string');
    }
    expect(at(first, 'country')).toBe('DEU');
  });

  it.each([101, 0])('rejects a page size of %i', async (first) => {
    const id = await create(testName('page size'), countryFilter('DEU'));
    const body = await gql(MEMBERS, { id, first });
    expect(body.errors?.[0]?.message).toMatch(/first must be from 1 to 100/);
    expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('rejects a cursor that did not come from a page', async () => {
    const id = await create(testName('cursor'), countryFilter('DEU'));
    const body = await gql(MEMBERS, { id, after: '1 or 1=1' });
    expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });
});

describe('previewAudience', () => {
  it('returns the same count and members as the saved audience, and saves nothing', async () => {
    const before = await count('select count(*)::int as n from audiences');
    const preview = at(
      await gql(PREVIEW, { definition: everyKindFilter }),
      'data',
      'previewAudience',
    );
    expect(await count('select count(*)::int as n from audiences')).toBe(before);

    const id = await create(testName('preview'), everyKindFilter);
    const saved = at(await gql(MEMBERS, { id }), 'data', 'audience');
    expect(at(preview, 'memberCount')).toBe(at(saved, 'memberCount'));
    expect(idsOf(at(preview, 'members'))).toEqual(idsOf(at(saved, 'members')));
  });

  it('rejects a page size above 100', async () => {
    const body = await gql(PREVIEW, { definition: everyKindFilter, first: 101 });
    expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });
});

const event = (eventType: string, amount: number, unit = 'DAY') => ({
  match: 'ALL',
  conditions: [{ event: { eventType, operator: 'PERFORMED', window: { amount, unit } } }],
});

describe('invalid filters', () => {
  it.each([
    [
      'an unknown field',
      {
        match: 'ALL',
        conditions: [{ attribute: { field: 'CITY', operator: 'IS', value: 'DEU' } }],
      },
      /"CITY" does not exist in "AttributeField"/,
    ],
    [
      'an unknown operator',
      {
        match: 'ALL',
        conditions: [{ attribute: { field: 'COUNTRY', operator: 'LIKE', value: 'DEU' } }],
      },
      /"LIKE" does not exist in "ConditionOperator"/,
    ],
    ['an unknown unit', event('purchase', 1, 'HOUR'), /"HOUR" does not exist in "WindowUnit"/],
    [
      'an unknown event type',
      event('refund', 1),
      /eventType must be one of: purchase, page_view\. Got "refund"/,
    ],
    ['a country that is not 3 uppercase letters', countryFilter('de'), /3 uppercase letters/],
    ['a country containing SQL', countryFilter("DEU' or '1'='1"), /3 uppercase letters/],
    ['an amount below 1', event('purchase', 0), /amount must be a whole number from 1 to 1000/],
    ['no conditions', { match: 'ALL', conditions: [] }, /1 to 20 conditions, got 0/],
    [
      'more than 20 conditions',
      {
        match: 'ALL',
        conditions: Array.from({ length: 21 }, () => countryFilter('DEU').conditions[0]),
      },
      /1 to 20 conditions, got 21/,
    ],
    [
      'an unsupported version',
      { ...countryFilter('DEU'), version: 2 },
      /version 2 is not supported/,
    ],
    [
      'a condition with two kinds set',
      {
        match: 'ALL',
        conditions: [
          {
            ...countryFilter('DEU').conditions[0],
            signedUp: { operator: 'WITHIN_LAST', window: { amount: 1, unit: 'DAY' } },
          },
        ],
      },
      /FilterConditionInput/,
    ],
  ])('rejects %s and saves nothing', async (_label, definition, message) => {
    const name = testName('invalid');
    const body = await gql(CREATE, { input: { name, definition } });
    expect(body.data ?? null).toBeNull();
    expect(body.errors?.[0]?.message).toMatch(message);
    expect(await audiencesNamed(name)).toBe(0);

    const preview = await gql(PREVIEW, { definition });
    expect(preview.errors?.[0]?.message).toMatch(message);
  });

  it('rejects a blank name and saves nothing', async () => {
    const body = await gql(CREATE, { input: { name: '   ', definition: countryFilter('DEU') } });
    expect(body.errors?.[0]?.message).toMatch(/name must be 1 to 100 characters/);
    expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(await audiencesNamed('')).toBe(0);
  });
});

describe('countries', () => {
  it('lists every customer country once, named and sorted by name', async () => {
    const result = await pool.query<{ country: string }>('select distinct country from customers');
    const countries = at(await gql('{ countries { code name } }'), 'data', 'countries');
    if (!Array.isArray(countries)) throw new Error('No countries returned.');

    const codes = countries.map((country: unknown) => String(at(country, 'code')));
    const names = countries.map((country: unknown) => String(at(country, 'name')));
    expect(codes.toSorted()).toEqual(result.rows.map((row) => row.country).toSorted());
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, 'en')));
    expect(countries).toContainEqual({ code: 'DEU', name: 'Germany' });
  });
});

describe('hello', () => {
  it('still answers', async () => {
    expect(await gql('{ hello }')).toEqual({ data: { hello: 'Hello from the API' } });
  });
});
