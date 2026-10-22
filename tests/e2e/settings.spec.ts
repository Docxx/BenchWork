import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', { '.benchwork/config.json': '{"version":1}' });
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
});

test('changing the theme recolours the app', async ({ page }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('radio', { name: 'Light' }).check();
  const light = await background();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await background()).not.toBe(light);
});

test('the link threshold is saved in the vault config', async ({ page }) => {
  await page.getByRole('tab', { name: 'Vault' }).click();
  const input = page.getByRole('spinbutton', { name: 'Link files larger than' });
  await input.fill('250');
  await input.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__benchworkMemory?.snapshot()['.benchwork/config.json']))
    .toContain('"linkThresholdMB": 250');
});

test('a bad threshold shows a message and is not saved', async ({ page }) => {
  await page.getByRole('tab', { name: 'Vault' }).click();
  const input = page.getByRole('spinbutton', { name: 'Link files larger than' });
  await input.fill('0');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('whole number');
  expect(
    await page.evaluate(() => window.__benchworkMemory?.snapshot()['.benchwork/config.json']),
  ).toBe('{"version":1}');
});

test('the Modules tab is reachable', async ({ page }) => {
  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Switching a module off never deletes');
});
