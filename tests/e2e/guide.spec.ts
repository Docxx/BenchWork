import { expect, test } from '@playwright/test';

/**
 * The first-run guide: someone new is shown how BenchWork works, makes a
 * vault, switches on a pack, picks a theme and gets a look round Home. It
 * can be run again from Settings.
 */

test('guides someone new from welcome to Home, and runs again from Settings', async ({ page }) => {
  await page.goto('/?guide');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/New', {});
    memory.queuePick('C:/New');
  });
  const guide = page.getByRole('dialog');
  await expect(guide.getByRole('heading', { name: 'Welcome to BenchWork' })).toBeVisible();
  await guide.getByRole('button', { name: 'Show me' }).click();
  await expect(guide.getByText('A vault is a folder.')).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: /^New vault/ }).click();
  await expect(guide.getByText('Your vault is ready:')).toBeVisible();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();

  await guide.getByRole('button', { name: /^Research/ }).click();
  await expect(guide.getByRole('status')).toHaveText('Research switched on.');
  await guide.getByRole('button', { name: 'Choose one by one' }).click();
  await expect(guide.getByRole('switch', { name: 'Inventory' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await guide.getByRole('button', { name: 'Next', exact: true }).click();

  await guide.getByText('Synthwave sunset').click();
  await expect(page.locator('html')).toHaveAttribute('data-preset', 'synthwave');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading', { name: 'Finding your way round' })).toBeVisible();
  await guide.getByRole('button', { name: 'Start using BenchWork' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit home' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Run the guide again' }).click();
  await expect(guide.getByRole('heading', { name: 'Welcome to BenchWork' })).toBeVisible();
  await guide.getByRole('button', { name: 'Skip the guide' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
