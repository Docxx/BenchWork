import { expect, test } from '@playwright/test';

test('sets up cloud sync, keeps recovery private until requested, and blocks a second sync engine', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let memory: Window['__benchworkMemory'];
    let running = false;
    const events: { seq: number; id: string; payload: string }[] = [];
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
            return Promise.resolve({ running, endpoint: 'https://192.168.1.5:47831', devices: [] });
          },
          stop: () => {
            running = false;
            return Promise.resolve();
          },
          status: () => Promise.resolve({ running, endpoint: '', devices: [] }),
          invitation: () => Promise.resolve({ text: '{}', svg: '<svg/>', expires: 9999999999 }),
          exportInvitation: () => Promise.resolve('Downloads/pair.json'),
          readInvitation: () => Promise.reject(new Error('unused')),
          join: () => Promise.reject(new Error('unused')),
          sync: () => Promise.resolve({ uploaded: 0, downloaded: 0, conflicts: [], skipped: [] }),
          revoke: () => Promise.resolve(),
        };
        value.relay = {
          request: (_endpoint, _cert, body) => {
            const data = JSON.parse(body) as {
              action: string;
              after: number;
              id: string;
              payload: string;
            };
            if (data.action === 'create')
              return Promise.resolve(
                JSON.stringify({ vault: 'test-vault-identity', token: 'owner-token' }),
              );
            if (data.action === 'devices')
              return Promise.resolve(JSON.stringify({ devices: ['PC'] }));
            if (data.action === 'invite')
              return Promise.resolve(
                JSON.stringify({
                  invitation: 'one-use-private-invitation',
                  expires: Math.floor(Date.now() / 1000) + 600,
                }),
              );
            if (data.action === 'append' && !events.some((e) => e.id === data.id))
              events.push({ seq: events.length + 1, id: data.id, payload: data.payload });
            if (data.action === 'events')
              return Promise.resolve(
                JSON.stringify({ events: events.filter((e) => e.seq > data.after) }),
              );
            return Promise.resolve('{}');
          },
          apply: (path, expected, bytes) => {
            // This fixture starts with unchanged Markdown only, so no projection is needed.
            return Promise.resolve(path !== '' && expected !== null && bytes !== null);
          },
        };
      },
    });
  });
  await page.goto('/');
  await page.evaluate(() => {
    window.__benchworkMemory?.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1}',
      'Lab/Notes.md': '# Notes\n',
    });
    window.__benchworkMemory?.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Sync', exact: true }).click();
  await page.getByText('First device or recovery', { exact: true }).click();
  await page.getByLabel('Cloud connection details').fill(
    JSON.stringify({
      endpoint: 'https://178.62.50.124',
      certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
      setup: 'one-use-server-setup',
    }),
  );
  await expect(page.getByRole('button', { name: 'Set up this vault', exact: true })).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'I stopped Syncthing and other folder sync for this vault' })
    .check();
  await page.getByRole('button', { name: 'Set up this vault', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Disconnect this device' })).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cloud recovery details')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show recovery details' }).click();
  expect(await page.getByLabel('Cloud recovery details').inputValue()).toContain('"recovery":1');
  await page.getByRole('button', { name: 'Pair another device', exact: true }).first().click();
  await expect(page.getByLabel('Cloud pairing details')).toBeVisible();
  await page.getByRole('button', { name: 'Start desktop server' }).click();
  await expect(page.getByRole('alert')).toContainText('Disconnect Cloud sync');
  await page.getByRole('button', { name: 'Disconnect this device' }).click();
  await expect(page.getByLabel('Cloud connection details')).toBeVisible();
});
