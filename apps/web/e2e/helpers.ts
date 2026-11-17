import { type APIRequestContext, expect } from '@playwright/test';

// The global teardown deletes every audience whose name starts with this.
export const E2E_PREFIX = 'E2E ';

export const uniqueName = (label: string) =>
  `${E2E_PREFIX}${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function graphql(request: APIRequestContext, query: string, variables: object) {
  const response = await request.post('/graphql', { data: { query, variables } });
  expect(response.ok()).toBe(true);
  const body: unknown = await response.json();
  return body;
}

export async function createAudience(request: APIRequestContext, name: string): Promise<string> {
  const body = await graphql(
    request,
    'mutation ($input: CreateAudienceInput!) { createAudience(input: $input) { id } }',
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
  const id = JSON.stringify(body).match(/"id":"(\d+)"/)?.[1];
  if (!id) throw new Error(`Audience was not created: ${JSON.stringify(body)}`);
  return id;
}
