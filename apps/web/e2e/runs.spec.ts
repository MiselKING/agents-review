import { expect, test } from '@playwright/test';

import { createAudience, uniqueName } from './helpers';

test('starts syncs of two audiences from the list and finds both runs', async ({
  page,
  request,
}) => {
  const first = uniqueName('sync a');
  const second = uniqueName('sync b');
  await createAudience(request, first);
  await createAudience(request, second);
  await page.goto('/');

  await page.getByRole('button', { name: `Sync now ${first}` }).click();
  await page.getByRole('button', { name: `Sync now ${second}` }).click();

  const rowOf = (name: string) =>
    page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(rowOf(first).getByText(/Sync started/)).toBeVisible();
  await expect(rowOf(second).getByText(/Sync started/)).toBeVisible();
  await expect(page).toHaveURL('/');

  await rowOf(first).getByRole('link', { name: 'View run history' }).click();
  await expect(page).toHaveURL('/runs');
  await expect(page.getByRole('link', { name: 'Run history' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const table = page.getByRole('table', { name: /Sync runs/ });
  await expect(table.getByRole('link', { name: first, exact: true })).toBeVisible();
  await expect(table.getByRole('link', { name: second, exact: true })).toBeVisible();
});
