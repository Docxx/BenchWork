import { expect, test } from '@playwright/test';

/** Receipts saved without `.jpg` or `.png` at the end still show, and can be given one. */

// A 1 by 1 PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({ version: 1 }),
      'Receipts/Note.md': '# Note\n',
    });
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await window.__benchworkMemory?.writeBytes('Receipts/Taxi £3.61 23-10-2026 ADI', bytes);
  }, PNG);
  await page.getByRole('button', { name: 'Refresh' }).click();
});

test('an image saved without an ending shows in the sidebar and opens', async ({ page }) => {
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Receipts' }).click();
  await tree.getByRole('treeitem', { name: 'Taxi £3.61 23-10-2026 ADI' }).click();
  await expect(page.getByRole('img', { name: 'Taxi £3.61 23-10-2026 ADI' })).toBeVisible();

  await page.getByRole('button', { name: 'Add .png' }).click();
  await expect(tree.getByRole('treeitem', { name: 'Taxi £3.61 23-10-2026 ADI.png' })).toBeVisible();
});
