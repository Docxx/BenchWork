import { expect, test } from '@playwright/test';

/**
 * Syncthing keeps both versions of a page changed on two devices before
 * they synced. BenchWork hides the copy from search and the sidebar, and
 * shows both side by side to choose from.
 */

const COPY = 'Lab/Plan.sync-conflict-20261028-113945-ABCDEF7.md';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((copy) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1}',
      '.stfolder': null,
      'Lab/Plan.md': '# Plan\n\nDay 1 on the computer.\n\nDay 2.\n',
      [copy]: '# Plan\n\nDay 1 on the tablet.\n\nDay 2.\n',
    });
    memory.queuePick('C:/Vault');
  }, COPY);
  await page.getByRole('button', { name: 'Open vault' }).click();
});

test('a page changed on two devices is shown side by side, and settled', async ({ page }) => {
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Lab' }).click();
  // Only the page shows in the sidebar, not its copy.
  await expect(tree.getByRole('treeitem', { name: 'Plan' })).toBeVisible();
  await expect(tree.getByRole('treeitem')).toHaveCount(2);

  await page.getByRole('button', { name: /Differences/ }).click();
  const conflict = page.getByRole('article', { name: 'Plan' });
  await expect(conflict.getByRole('region', { name: 'This page' })).toContainText('computer');
  await expect(conflict.getByRole('region', { name: 'The other copy' })).toContainText('tablet');
  await expect(conflict.locator('.diff-line.changed')).toHaveCount(2);

  await conflict.getByRole('button', { name: 'Use the other copy' }).click();
  await expect(page.getByText('Nothing left to settle.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Differences/ })).toHaveCount(0);
  const files = await page.evaluate(() => window.__benchworkMemory?.snapshot() ?? {});
  expect(files['Lab/Plan.md']).toContain('tablet');
  expect(files[COPY]).toBeUndefined();
  // In a folder Syncthing syncs, the index is kept out of syncing.
  expect(files['.stignore']).toContain('.benchwork/index.sqlite*');
});
