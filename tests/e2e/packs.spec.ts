import { expect, test } from '@playwright/test';

/** A new vault asks what it is for, and switches on the modules that suit. */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/New', {});
    memory.queuePick('C:/New');
  });
  await page.getByRole('button', { name: 'New vault' }).click();
});

test('choosing Research switches on the research modules', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'What do you do?' });
  await dialog.getByRole('button', { name: /^Research/ }).click();
  await expect(dialog).toHaveCount(0);
  const config = await page.evaluate(
    () => window.__benchworkMemory?.snapshot()['.benchwork/config.json'] ?? '',
  );
  const modules = (JSON.parse(config) as { modules: Record<string, { enabled: boolean }> }).modules;
  for (const id of [
    'lab-notebook',
    'research',
    'references',
    'inventory',
    'tasks',
    'handwriting',
  ]) {
    expect(modules[id]?.enabled).toBe(true);
  }
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(page.getByRole('switch', { name: /Inventory/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('Just notes switches nothing on, and packs are there later in Settings', async ({ page }) => {
  await page
    .getByRole('dialog', { name: 'What do you do?' })
    .getByRole('button', { name: /^Just notes/ })
    .click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(page.getByRole('switch', { name: /Mind maps/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.getByRole('button', { name: 'Switch on General notes' }).click();
  await expect(page.getByRole('status')).toContainText('General notes pack switched on');
  await expect(page.getByRole('switch', { name: /Mind maps/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});
