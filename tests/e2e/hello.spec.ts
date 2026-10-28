import { expect, test, type Page } from '@playwright/test';

const VAULT_FILES = {
  '.benchwork/config.json': '{"version":1}',
  'Daily/2026-10-22.md': '# Thursday\nFlies transferred 10:30.',
  'LPS model/Experiments/2026-10-21 LPS dose.md': '---\nid: 8f3c\n---\nNotes',
  'LPS model/Data/climbing-day7.csv': 'fly,height\n1,4.2\n2,3.9',
  'references/library.bib': '@article{smith2024tau}',
};

/** Every file and folder outside .benchwork, with contents and modified time. */
async function userFiles(page: Page) {
  return page.evaluate(async () => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    const found: Record<string, { content: string | null; modified: number | null }> = {};
    const walk = async (dir: string) => {
      for (const entry of await memory.listDir(dir)) {
        if (entry.path === '.benchwork') continue;
        found[entry.path] = {
          content: entry.isDir ? null : await memory.readText(entry.path),
          modified: entry.modified,
        };
        if (entry.isDir) await walk(entry.path);
      }
    };
    await walk('');
    return found;
  });
}

async function benchworkFiles(page: Page) {
  return page.evaluate(() =>
    Object.entries(window.__benchworkMemory?.snapshot() ?? {})
      .filter(([path]) => path.startsWith('.benchwork'))
      .map(([path]) => path),
  );
}

const helloPanel = (page: Page) => page.getByRole('region', { name: 'Hello' });

/** Panels start folded; opens Hello's, once it is there. */
async function openHello(page: Page) {
  const heading = helloPanel(page).getByRole('button', { name: 'Hello' });
  if ((await heading.getAttribute('aria-expanded')) !== 'true') await heading.click();
}
const helloSwitch = (page: Page) => page.getByRole('switch', { name: /Hello/ });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', files);
    memory.queuePick('C:/Vault');
  }, VAULT_FILES);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
});

test('Hello is listed, off by default, and adds a sidebar panel when switched on', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(helloSwitch(page)).toHaveAttribute('aria-checked', 'false');
  await expect(helloPanel(page)).toHaveCount(0);

  await helloSwitch(page).click();
  await expect(helloSwitch(page)).toHaveAttribute('aria-checked', 'true');
  await openHello(page);
  await expect(helloPanel(page)).toContainText('switched on once');

  await helloSwitch(page).click();
  await expect(helloSwitch(page)).toHaveAttribute('aria-checked', 'false');
  await expect(helloPanel(page)).toHaveCount(0);
});

test('switching Hello on and off never touches vault files', async ({ page }) => {
  const before = await userFiles(page);
  expect(Object.keys(before)).toHaveLength(9);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  for (let i = 0; i < 3; i += 1) {
    await helloSwitch(page).click();
    await expect(helloPanel(page)).toBeVisible();
    await helloSwitch(page).click();
    await expect(helloPanel(page)).toHaveCount(0);
  }

  // Same files, same contents, same modified times.
  expect(await userFiles(page)).toEqual(before);

  // The only things written are the vault config and Hello's own folder.
  expect(await benchworkFiles(page)).toEqual([
    '.benchwork',
    '.benchwork/config.json',
    '.benchwork/modules',
    '.benchwork/modules/hello',
    '.benchwork/modules/hello/state.json',
  ]);
});

test('switching off keeps the module data, and the switch is saved in config.json', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await helloSwitch(page).click();
  await openHello(page);
  await expect(helloPanel(page)).toContainText('once');
  await helloSwitch(page).click();
  await expect(helloPanel(page)).toHaveCount(0);

  const config = await page.evaluate(() =>
    window.__benchworkMemory?.readText('.benchwork/config.json'),
  );
  expect(JSON.parse(config ?? '{}')).toMatchObject({ modules: { hello: { enabled: false } } });

  await helloSwitch(page).click();
  await expect(helloPanel(page)).toContainText('2 times');
});

test('Hello comes back on when the vault is reopened', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await helloSwitch(page).click();
  await expect(helloPanel(page)).toBeVisible();

  await page.getByRole('button', { name: 'Switch vault' }).first().click();
  await expect(page.getByRole('button', { name: 'Open vault' })).toBeVisible();
  await page.evaluate(() => {
    window.__benchworkMemory?.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await openHello(page);
  await expect(helloPanel(page)).toContainText('2 times');
});
