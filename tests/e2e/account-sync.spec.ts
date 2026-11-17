import { expect, test, type Page } from '@playwright/test';
import { fakeAccountRelay } from '../../src/test/fakeAccountRelay';

/**
 * Gives a page's in-memory platform the account relay, run here in the test,
 * so two pages act as two devices on one account.
 */
async function device(page: Page, relay: ReturnType<typeof fakeAccountRelay>, name: string) {
  await page.exposeFunction('__accountRelay', (body: string) => relay.request('', '', body));
  await page.addInitScript((deviceName: string) => {
    const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
    let memory: Window['__benchworkMemory'];
    Object.defineProperty(window, '__benchworkMemory', {
      get() {
        return memory;
      },
      set(value: NonNullable<Window['__benchworkMemory']>) {
        memory = value;
        const call = (window as unknown as { __accountRelay: (b: string) => Promise<string> })
          .__accountRelay;
        value.relay = {
          request: (_endpoint, _certificate, body) => call(body),
          apply: async (path, expected, encoded) => {
            const actual = (await value.exists(path)) ? await value.hashFile(path) : null;
            if (actual !== expected) return false;
            if (encoded === null) {
              if (actual) await value.trash(path);
            } else {
              const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
              await value.ensureDir(parent);
              await value.writeBytes(path, fromBase64(encoded));
            }
            return true;
          },
          account: {
            relay: () =>
              Promise.resolve({
                endpoint: 'https://178.62.50.124',
                certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
                device: deviceName,
              }),
            // Quick PBKDF2 stands in for Argon2id, as in the unit tests.
            deriveKey: async (password, salt) => {
              const key = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveBits'],
              );
              const bits = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: 10 },
                key,
                512,
              );
              return toBase64(new Uint8Array(bits));
            },
            prepareFolder: (folder) => {
              const path = `C:/Users/Ray/Documents/BenchWork/${folder}`;
              value.addFolder(path, {});
              return Promise.resolve(path);
            },
          },
        };
      },
    });
  }, name);
  await page.goto('/');
}

const PASSWORD = 'a long pass phrase';

test('creates an account on one device and a fresh device syncs the vault after signing in', async ({
  browser,
}) => {
  const relay = fakeAccountRelay();
  relay.signups.add('one-use-signup-code');

  // The PC: create the account, then sync an existing vault with it.
  const pc = await (await browser.newContext()).newPage();
  await device(pc, relay, 'PC');
  await pc.evaluate(() => {
    window.__benchworkMemory?.addFolder('C:/Lab notes', {
      '.benchwork/config.json': '{"version":1}',
      'Experiments/Day 1.md': '# Day 1\n\nPCR worked.\n',
    });
  });
  await expect(pc.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await pc.getByRole('button', { name: 'Create account' }).click();
  await pc.getByLabel('Username').fill('Ray');
  await pc.getByLabel('New password').fill('too short');
  await pc.getByLabel('Type it again').fill('too short');
  await pc.getByLabel('Sign-up code').fill('one-use-signup-code');
  await pc.getByRole('button', { name: 'Create account' }).first().click();
  await expect(pc.getByRole('alert')).toContainText('at least 12 characters');
  await pc.getByLabel('New password').fill(PASSWORD);
  await pc.getByLabel('Type it again').fill(PASSWORD);
  await pc.getByRole('button', { name: 'Create account' }).first().click();

  const dialog = pc.getByRole('dialog', { name: 'Your recovery key' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('code')).toHaveText(/^([0-9a-f]{4}-){15}[0-9a-f]{4}$/);
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'I have saved my recovery key' }).check();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(pc.getByText('Signed in as ray')).toBeVisible();

  await pc.evaluate(() => {
    window.__benchworkMemory?.queuePick('C:/Lab notes');
  });
  await pc.getByRole('button', { name: 'Open vault' }).click();
  await pc.getByRole('button', { name: 'Settings', exact: true }).click();
  await pc.getByRole('tab', { name: 'Sync', exact: true }).click();
  const account = pc.getByLabel('Account', { exact: true });
  await expect(account.getByText('This vault does not sync with your account yet.')).toBeVisible();
  await account
    .getByRole('checkbox', { name: 'I stopped Syncthing and other folder sync for this vault' })
    .check();
  await account.getByRole('button', { name: 'Sync this vault with your account' }).click();
  await expect(account.getByRole('status').first()).toHaveText(/Up to date|Syncing|Waiting/);

  // The tablet: a fresh install. Signing in is the only step.
  const tablet = await (await browser.newContext()).newPage();
  await device(tablet, relay, 'Tablet');
  await tablet.getByLabel('Username').fill('ray');
  await tablet.getByLabel('Password').fill('not the password');
  await tablet.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(tablet.getByRole('alert')).toContainText('Username or password is wrong');
  await tablet.getByLabel('Password').fill(PASSWORD);
  await tablet.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(tablet.getByRole('treeitem', { name: /Experiments/ })).toBeVisible();
  const files = await tablet.evaluate(() =>
    window.__benchworkMemory?.readText('Experiments/Day 1.md'),
  );
  expect(files).toContain('PCR worked.');

  // The PC lists both devices.
  await pc.getByRole('button', { name: 'Show devices' }).click();
  await expect(pc.getByLabel('Your devices').getByRole('listitem')).toHaveText([
    'PC (this device)',
    /Tablet/,
  ]);
});
