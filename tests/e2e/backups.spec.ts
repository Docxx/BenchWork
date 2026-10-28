import { expect, test } from '@playwright/test';

/** Vault backups in Settings > Vault: back up, restore a copy, and open it. */

test('the vault is backed up, and a backup restored and opened as a copy', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Lab vault', {
      '.benchwork/config.json': '{"version":1}',
      'Lab/Plan.md': '# Plan\n\nDay 1.\n',
    });
    memory.addFolder('D:/Backups', {});
    memory.queuePick('C:/Lab vault', 'D:/Backups');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Vault' }).click();

  const backups = page.getByRole('group', { name: 'Backups' });
  await backups.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(backups.getByText('D:/Backups')).toBeVisible();
  await backups.getByRole('button', { name: 'Back up now' }).click();
  await expect(backups.getByRole('status')).toContainText('Backed up to Lab vault backup');
  const list = backups.getByRole('list', { name: 'Backups' });
  await expect(list.getByRole('listitem')).toHaveCount(1);

  await list.getByRole('button', { name: /^Restore/ }).click();
  await list.getByRole('button', { name: 'Restore a copy' }).click();
  await expect(
    backups.getByText(/Restored into D:\/Backups\/Lab vault restored from/),
  ).toBeVisible();
  await backups.getByRole('button', { name: 'Open the restored copy' }).click();

  await expect(page.getByRole('heading', { name: /restored from/ })).toBeVisible();
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Lab' }).click();
  await expect(tree.getByRole('treeitem', { name: 'Plan' })).toBeVisible();
});
