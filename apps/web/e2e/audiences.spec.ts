import { expect, test } from '@playwright/test';

import {
  archiveCreatedAudiences,
  created,
  createAudience,
  idOfAudienceNamed,
  uniqueName,
} from './helpers';

test.afterEach(async ({ request }) => {
  await archiveCreatedAudiences(request);
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

test('pages through the members of an audience', async ({ page, request }) => {
  const name = uniqueName('members');
  const id = await createAudience(request, name);
  await page.goto('/');
  await page.getByRole('link', { name: `View members of ${name}` }).click();
  await expect(page).toHaveURL(`/audiences/${id}/members`);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

  const table = page.getByRole('table', { name: `Members of ${name}` });
  await expect(table.getByRole('row')).toHaveCount(26);
  await expect(page.getByText(/^1–25 of /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  const firstEmail = await table.getByRole('row').nth(1).getByRole('cell').nth(1).innerText();
  const lastOnFirstPage = await table.getByRole('row').nth(25).getByRole('cell').nth(1).innerText();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(/^26–\d+ of /)).toBeVisible();
  await expect(table.getByRole('cell', { name: firstEmail, exact: true })).toHaveCount(0);
  await expect(table.getByRole('cell', { name: lastOnFirstPage, exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(table.getByRole('cell', { name: firstEmail, exact: true })).toBeVisible();
  await expect(page.getByText(/^1–25 of /)).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(26);
});
