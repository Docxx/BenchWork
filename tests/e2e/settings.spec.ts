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
  await page.getByRole('tab', { name: 'Appearance' }).click();
  const scheme = page.getByRole('group', { name: 'Light or dark' });
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await scheme.getByRole('radio', { name: 'Light' }).check();
  const light = await background();
  await scheme.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await background()).not.toBe(light);
});

test('the accent colour, page font and sidebar can be changed', async ({ page }) => {
  await page.getByRole('tab', { name: 'Appearance' }).click();
  const token = (name: string) =>
    page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n), name);
  await page.getByRole('button', { name: 'Plum' }).click();
  await expect.poll(() => token('--accent')).toBe('#7d5ba6');
  await page
    .getByRole('group', { name: 'Page text' })
    .getByRole('radio', { name: 'Sans serif' })
    .check();
  await expect.poll(() => token('--font-body')).toContain('Inter');

  await page.getByRole('button', { name: 'Hide the sidebar' }).click();
  await expect(page.getByRole('navigation', { name: 'Vault' })).toBeHidden();
  await page.getByRole('button', { name: 'Show the sidebar' }).click();
  await expect(page.getByRole('navigation', { name: 'Vault' })).toBeVisible();
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

test('more themes, the page colour and pattern, and widths can be chosen', async ({ page }) => {
  await page.getByRole('tab', { name: 'Appearance' }).click();
  const token = (name: string) =>
    page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n), name);
  await page
    .getByRole('group', { name: 'Light or dark' })
    .getByRole('radio', { name: 'Light' })
    .check();
  await page
    .getByRole('group', { name: 'Theme', exact: true })
    .getByText('Ocean', { exact: true })
    .click();
  await expect.poll(() => token('--bg')).toBe('#f5f8fa');
  await page.getByRole('button', { name: 'Cream' }).click();
  await expect.poll(() => token('--paper')).toBe('#fbf4de');
  await page.getByRole('group', { name: 'Page pattern' }).getByText('Grid').click();
  await expect.poll(() => token('--paper-pattern')).toContain('90deg');

  const edge = page.getByRole('separator', { name: 'Sidebar width' });
  await edge.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => token('--sidebar-width')).toBe('276px');
  const nav = page.getByRole('navigation', { name: 'Vault' });
  // 276 wide, and its 1px border.
  expect(Math.round((await nav.boundingBox())?.width ?? 0)).toBe(277);
  await page.keyboard.press('Home');
  await expect.poll(() => token('--sidebar-width')).toBe('260px');
});
