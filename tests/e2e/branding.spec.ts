import { expect, test } from '@playwright/test';

test('Open Record appears on the picker and sidebar and stays readable across themes', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.picker-logo[data-brand="open-record"]')).toBeVisible();
  await expect(page.locator('.splash')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  await page.screenshot({ path: testInfo.outputPath('open-record-picker.png') });
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Use the memory platform');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1}',
      'Lab/Notes.md': '# Notes\n',
    });
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  const mark = page.locator('.sidebar-header [data-brand="open-record"]');
  await expect(mark).toBeVisible();
  await expect(mark.locator('.logo-trace')).toHaveAttribute('stroke', '#f058de');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.getByText('Starship bridge', { exact: true }).click();
  await expect(mark.locator('.logo-trace')).toHaveAttribute('stroke', '#f058de');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('open-record-sidebar.png') });
});
