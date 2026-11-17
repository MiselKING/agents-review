import { type APIRequestContext, expect, type Page } from '@playwright/test';

// Audiences the tests created; archived after each test so the shared database stays clean.
export const created: string[] = [];

// The global teardown deletes every audience whose name starts with this.
export const E2E_PREFIX = '[e2e] ';

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
  created.push(id);
  return id;
}

export async function idOfAudienceNamed(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  const id = href?.split('/').at(-1);
  if (!id) throw new Error(`No link for ${name}`);
  return id;
}

export async function archiveCreatedAudiences(request: APIRequestContext) {
  for (const id of created.splice(0)) {
    // Archiving one that a test already archived fails harmlessly.
    // oxlint-disable-next-line no-await-in-loop
    await request.post('/graphql', {
      data: { query: 'mutation ($id: ID!) { archiveAudience(id: $id) { id } }', variables: { id } },
    });
  }
}
