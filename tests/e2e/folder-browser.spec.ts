import { expect, test } from '@playwright/test';

/**
 * On the tablet, vault folders are chosen inside the app: Android's own
 * picker gives no folder paths. BenchWork asks for access to the tablet's
 * folders first.
 */

test('a vault folder is chosen inside the app, once access is allowed', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('/storage/emulated/0', {
      Documents: null,
      'Documents/Lab vault/.benchwork/config.json': '{"version":1}',
      'Documents/Lab vault/Notes.md': '# Notes\n',
      Download: null,
    });
    const access = memory.useFolderBrowser('/storage/emulated/0');
    (window as unknown as { grantAccess: () => void }).grantAccess = access.grant;
  });
  await page.getByRole('button', { name: 'Open vault' }).click();

  await expect(
    page.getByRole('heading', { name: 'Allow BenchWork to use your folders' }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { grantAccess: () => void }).grantAccess();
    window.dispatchEvent(new Event('focus'));
  });

  const folders = page.getByRole('list', { name: 'Folders' });
  await expect(folders.getByRole('button')).toHaveText(['Documents', 'Download']);
  await folders.getByRole('button', { name: 'Documents' }).click();
  await folders.getByRole('button', { name: 'Lab vault' }).click();
  await page.getByRole('button', { name: 'Open this folder' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Notes' })).toBeVisible();
});

test('a new folder can be made for a new vault', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('/storage/emulated/0', { Documents: null });
    memory.useFolderBrowser('/storage/emulated/0').grant();
  });
  await page.getByRole('button', { name: 'New vault' }).click();
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByRole('textbox', { name: 'New folder name' }).fill('BenchWork');
  await page.getByRole('button', { name: 'Make folder' }).click();
  await expect(page.locator('.path')).toHaveText('/storage/emulated/0/BenchWork');
  await page.getByRole('button', { name: 'Make the vault here' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
});
