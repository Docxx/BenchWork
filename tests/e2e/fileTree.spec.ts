import { expect, test } from '@playwright/test';

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'Day 10.md': '',
  'Day 2.md': '',
  'LPS model/Experiments/2026-10-21 LPS dose.md': 'x',
  'LPS model/notes.md': '',
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((contents) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', contents);
    memory.queuePick('C:/Vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
});

test('lists the vault with folders first, in natural order, hiding .benchwork', async ({
  page,
}) => {
  const items = page.getByRole('treeitem');
  await expect(items).toHaveText(['▸LPS model', 'Day 2.md', 'Day 10.md']);
});

test('opens folders with the mouse and the keyboard', async ({ page }) => {
  await page.getByRole('treeitem', { name: 'LPS model' }).click();
  await expect(page.getByRole('treeitem', { name: 'Experiments' })).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('treeitem', { name: '2026-10-21 LPS dose.md' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('treeitem', { name: '2026-10-21 LPS dose.md' })).toHaveCount(0);
});

test('refresh shows files added outside BenchWork', async ({ page }) => {
  await page.evaluate(() => {
    void window.__benchworkMemory?.writeTextAtomic('New page.md', '');
  });
  await expect(page.getByRole('treeitem', { name: 'New page.md' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('treeitem', { name: 'New page.md' })).toBeVisible();
});
