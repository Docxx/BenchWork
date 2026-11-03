import { expect, test } from '@playwright/test';

test('Desktop Sync requires one sync engine, supports pairing and reports saved-file transfers', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let memory: Window['__benchworkMemory'];
    let running = false;
    const endpoint = 'https://192.168.1.5:47831';
    Object.defineProperty(window, '__benchworkMemory', {
      get() {
        return memory;
      },
      set(value: NonNullable<Window['__benchworkMemory']>) {
        memory = value;
        value.nativeSync = {
          localAddress: () => Promise.resolve('192.168.1.5'),
          start: () => {
            running = true;
            return Promise.resolve({ running, endpoint, devices: [] });
          },
          stop: () => {
            running = false;
            return Promise.resolve();
          },
          status: () => Promise.resolve({ running, endpoint, devices: [] }),
          invitation: () =>
            Promise.resolve({
              text: '{"version":1}',
              svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
              expires: 9999999999,
            }),
          exportInvitation: () => Promise.resolve('Downloads/BenchWork-pair.json'),
          readInvitation: () => Promise.reject(new Error('Choose a pairing file')),
          join: () =>
            Promise.resolve({
              endpoint,
              certificate: 'test',
              vault: 'a'.repeat(64),
              token: 'test-secret',
            }),
          sync: () =>
            Promise.resolve({
              uploaded: 1,
              downloaded: 2,
              conflicts: ['Notes/Offline (sync copy).md'],
              skipped: [],
            }),
          revoke: () => Promise.resolve(),
        };
      },
    });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    memory?.addFolder('C:/Vault', { '.benchwork/config.json': '{"version":1}', '.stfolder': null });
    memory?.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.locator('.splash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Sync', exact: true }).click();
  await page.getByRole('button', { name: 'Start desktop server', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Pause Syncthing');
  await page.getByLabel('I paused Syncthing for this vault', { exact: false }).check();
  await page.getByRole('button', { name: 'Start desktop server', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Desktop server is listening');
  await page.getByRole('button', { name: 'Pair another device', exact: true }).click();
  await expect(page.getByAltText('Short-lived BenchWork device pairing code')).toBeVisible();
  await page.getByRole('button', { name: 'Save pairing file to Downloads', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Downloads/BenchWork-pair.json');
  await page
    .getByRole('button', { name: 'Disable Desktop Sync on this device', exact: true })
    .click();
  await page.getByText('Paste pairing details instead', { exact: true }).click();
  await page.getByLabel('Pairing details from desktop').fill('invalid pairing data');
  await page.getByRole('button', { name: 'Pair with desktop', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Pairing details from desktop')).toHaveValue('invalid pairing data');
  await page.getByLabel('Pairing details from desktop').fill('{"version":1}');
  await page.getByRole('button', { name: 'Pair with desktop', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 uploaded, 2 downloaded');
  await expect(page.getByText('Notes/Offline (sync copy).md', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
