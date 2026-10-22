import { expect, test } from '@playwright/test';

test('app loads with an empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BenchWork' })).toBeVisible();
  await expect(page.getByText('No vault open.')).toBeVisible();
});
