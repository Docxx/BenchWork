import { expect, test } from '@playwright/test';
test('offers a newer release, downloads it, and waits for an explicit install action', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let memory: Window['__benchworkMemory'];
    Object.defineProperty(window, '__benchworkMemory', {
      get() {
        return memory;
      },
      set(value: NonNullable<Window['__benchworkMemory']>) {
        memory = value;
        value.updates = {
          check: () => Promise.resolve({ version: '99.0.0', notes: 'Improved sync', size: 1000 }),
          download: (_version, progress) => {
            progress(1000, 1000);
            return Promise.resolve();
          },
          prepareInstall: () => Promise.resolve(true),
          install: () => {
            document.documentElement.dataset['testInstallerOpened'] = 'yes';
            return Promise.resolve();
          },
        };
      },
    });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const p = window.__benchworkMemory;
    p?.addFolder('C:/Vault', { '.benchwork/config.json': '{"version":1}' });
    p?.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.locator('.splash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(page.getByText('BenchWork 99.0.0 is available')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install update', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Download update', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Install update', exact: true })).toBeVisible();
  expect(await page.locator('html').getAttribute('data-test-installer-opened')).toBeNull();
  await page.getByRole('button', { name: 'Install update', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-test-installer-opened', 'yes');
});
