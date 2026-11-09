import { expect, test } from '@playwright/test';

test('shows the hello result from the API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hello')).toHaveText('Hello from the API (demo)');
});
