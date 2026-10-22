import { expect, test } from '@playwright/test';

test('app loads with the vault picker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BenchWork' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New vault' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open vault' })).toBeVisible();
});
