import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

// Audiences this file created; archived after each test so the shared database stays clean.
const created: string[] = [];

const uniqueName = (label: string) =>
  `E2E ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function graphql(request: APIRequestContext, query: string, variables: object) {
  const response = await request.post('/graphql', { data: { query, variables } });
  expect(response.ok()).toBe(true);
  const body: unknown = await response.json();
  return body;
}

async function createAudience(request: APIRequestContext, name: string): Promise<string> {
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

async function idOfAudienceNamed(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  const id = href?.split('/').at(-1);
  if (!id) throw new Error(`No link for ${name}`);
  return id;
}

test.afterEach(async ({ request }) => {
  for (const id of created.splice(0)) {
    // Archiving one that a test already archived fails harmlessly.
    // oxlint-disable-next-line no-await-in-loop
    await request.post('/graphql', {
      data: { query: 'mutation ($id: ID!) { archiveAudience(id: $id) { id } }', variables: { id } },
    });
  }
});

test('creates an audience from the builder', async ({ page }) => {
  const name = uniqueName('create');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Audiences', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'New audience' }).click();

  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Any condition').check();
  await page.getByLabel('Condition 1 country').fill('germ');
  await page.getByRole('option', { name: /Germany/ }).click();
  await expect(page.getByLabel('Condition 1 country')).toHaveValue('Germany (DEU)');

  await page.getByRole('button', { name: 'Add condition' }).click();
  await page.getByLabel('Condition 2 type').selectOption('Event');
  await page.getByLabel('Condition 2 amount').fill('14');

  await expect(page.getByText('matching customers')).toBeVisible();
  await page.getByRole('button', { name: 'Create audience' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  created.push(await idOfAudienceNamed(page, name));
});

test('edits an audience', async ({ page, request }) => {
  const name = uniqueName('edit');
  const id = await createAudience(request, name);
  await page.goto('/');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(`/audiences/${id}`);
  await expect(page.getByLabel('Condition 1 country')).toHaveValue('Germany (DEU)');

  const renamed = `${name} renamed`;
  await page.getByLabel('Name').fill(renamed);
  await page.getByLabel('Condition 1 operator').selectOption('is not');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: renamed, exact: true }).click();
  await expect(page.getByLabel('Condition 1 operator')).toHaveValue('IS_NOT');
});

test('archives an audience only after confirmation', async ({ page, request }) => {
  const name = uniqueName('archive');
  await createAudience(request, name);
  await page.goto('/');
  const archive = page.getByRole('button', { name: `Archive ${name}` });

  await archive.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();

  await archive.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
});

test('blocks saving until the problems are fixed', async ({ page }) => {
  await page.goto('/audiences/new');
  await page.getByRole('button', { name: 'Create audience' }).click();
  await expect(page.getByText('Enter a name.')).toBeVisible();
  await expect(page.getByText('Choose a country.')).toBeVisible();
  await expect(page).toHaveURL('/audiences/new');
});

test('shows not found for an unknown audience and an unknown page', async ({ page }) => {
  await page.goto('/audiences/999999999');
  await expect(page.getByRole('heading', { name: 'Audience not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to audiences' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
