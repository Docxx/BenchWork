import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Memory platform required');
    const files: Record<string, string> = {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: Object.fromEntries(
          ['references', 'knowledge-graph', 'cloud'].map((id) => [id, { enabled: true }]),
        ),
      }),
      'Papers/paper.pdf': 'pdf',
      'Admin/Invoice.pdf': 'invoice',
      'Literature/methods.pdf': 'paper',
      'Data/images.dataset.yaml': 'id: images\nfiles: []\n',
      'Research/Hub.md':
        '# Project\n\n' + Array.from({ length: 12 }, (_, i) => `[[Note ${String(i)}]]`).join('\n'),
    };
    for (let i = 0; i < 12; i++)
      files[`Research/Note ${String(i)}.md`] =
        `---\ntags: [lab]\n---\n# Finding ${String(i)}\n\n[[Hub]]\n`;
    memory.addFolder('C:/Vault', files);
    memory.addFolder('C:/Dropbox', {});
    memory.addExternalFile('C:/Raw/image.tif', 'image pixels');
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
  await expect(page.locator('.splash')).toHaveCount(0);
}

test('Home calendar has compact days and saves view and appearance choices', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await open(page);
  const calendar = page.getByRole('article', { name: 'Home' }).locator('.calendar');
  const home = page.getByRole('article', { name: 'Home' });
  await home.getByRole('button', { name: 'Edit home' }).click();
  for (const card of ['Tools', 'Today', 'Recent pages', 'Pinned'])
    await home.getByRole('button', { name: `Hide ${card}`, exact: true }).click();
  const grip = home.getByRole('button', { name: 'Move Calendar' });
  for (let i = 0; i < 8; i++) await grip.press('Shift+ArrowRight');
  await home.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(calendar.locator('button.calendar-day')).toHaveCount(42);
  const cell = await calendar.locator('button.calendar-day').first().boundingBox();
  expect(cell?.height).toBeLessThanOrEqual(40);
  await calendar.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(calendar.locator('button.calendar-day')).toHaveCount(7);
  await calendar.getByRole('button', { name: 'Customise calendar' }).click();
  await calendar.getByLabel('Calendar week starts').selectOption('sunday');
  await calendar.getByLabel('Calendar day size').selectOption('comfortable');
  await calendar.getByLabel('Calendar accent').selectOption('purple');
  await expect(calendar.locator('.calendar-weekday').first()).toHaveText('Sun');
  await calendar.screenshot({ path: info.outputPath('calendar.png') });
  await calendar.getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(calendar.getByLabel('Calendar agenda')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(calendar.getByRole('button', { name: 'Agenda', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Reading desk limits PDFs to the folder the user chooses', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Reading desk', exact: true }).click();
  const library = page.getByRole('region', { name: 'PDF library' });
  await expect(library.getByRole('button', { name: /paper.pdf/ })).toBeVisible();
  await expect(library.getByText('Invoice.pdf', { exact: true })).toHaveCount(0);
  await library.getByRole('button', { name: 'Choose papers folder' }).click();
  await library.getByRole('button', { name: 'Parent folder' }).click();
  await library.getByRole('button', { name: 'Literature /', exact: true }).click();
  await library.getByRole('button', { name: 'Use this folder' }).click();
  await expect(library.getByRole('button', { name: /methods.pdf/ })).toBeVisible();
  await expect(library.getByRole('button', { name: /paper.pdf/ })).toHaveCount(0);
});

test('Modules settings offers categories, search and status filters', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Modules', exact: true }).click();
  await page.getByLabel('Search modules').fill('cloud');
  await expect(page.getByRole('switch', { name: /Cloud storage/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /References/ })).toHaveCount(0);
  await page.getByLabel('Module status').selectOption('off');
  await expect(page.getByText('No modules match these filters.')).toBeVisible();
  await page.getByLabel('Module status').selectOption('all');
  await page.getByLabel('Search modules').fill('');
  await page.getByLabel('Module category').selectOption('Reading and writing');
  await expect(page.getByRole('switch', { name: /References/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Cloud storage/ })).toHaveCount(0);
});

test('Cloud storage verifies copies and requires upload confirmation before source removal', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Cloud storage', exact: true }).click();
  await page.getByLabel('Cloud provider').selectOption('Dropbox');
  await page.evaluate(() => window.__benchworkMemory?.queuePick('C:/Dropbox'));
  await page.getByRole('button', { name: 'Choose provider folder' }).click();
  await page.getByRole('button', { name: 'Open data folder · Dropbox' }).click();
  expect(await page.evaluate(() => window.__benchworkMemory?.openedFolders.at(-1))).toBe(
    'C:/Dropbox',
  );
  await page.evaluate(() => window.__benchworkMemory?.queueFilePick(['C:/Raw/image.tif']));
  await page.getByRole('button', { name: 'Choose data file' }).click();
  await page.getByLabel('Link to dataset').selectOption('Data/images.dataset.yaml');
  await page.getByRole('button', { name: 'Copy and verify' }).click();
  await expect(page.getByRole('region', { name: 'Storage file details' })).toBeVisible();
  await page.getByRole('button', { name: 'Open stored file', exact: true }).click();
  expect(await page.evaluate(() => window.__benchworkMemory?.openedFiles.at(-1))).toMatch(
    /^C:\/Dropbox\/BenchWork-.*\/image.tif$/,
  );
  await expect(page.getByText(/SHA-256:/)).toContainText(/[a-f0-9]{64}/);
  await page.getByRole('button', { name: 'Verify stored copy' }).click();
  await expect(page.getByRole('status')).toContainText('Stored copy verified');
  await page.getByRole('button', { name: 'Manage local space' }).click();
  const remove = page.getByRole('button', { name: 'Move original to Recycle Bin' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('I checked that the provider has finished uploading this file').check();
  await remove.click();
  await expect(page.getByText('Original source moved to the Recycle Bin.')).toBeVisible();
  const record = await page.evaluate(
    () =>
      Object.entries(window.__benchworkMemory?.snapshot() ?? {}).find(([path]) =>
        path.endsWith('.cloud.yaml'),
      )?.[1] ?? '',
  );
  expect(record).toContain('sourceRemoved: true');
  expect(record).toContain('confirmed-by-user');
});

test('Graph filters and presets keep the research view focused', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Knowledge graph', exact: true }).click();
  await expect(page.getByRole('img', { name: /^Interactive knowledge graph/ })).toBeVisible();
  await page.getByLabel('Graph folder').selectOption('Research');
  await page.getByLabel('Graph file types').selectOption('note');
  await page.getByRole('button', { name: 'Graph appearance' }).click();
  await page.getByRole('button', { name: 'Research map', exact: true }).click();
  await page.getByRole('button', { name: 'Graph appearance' }).click();
  await page.locator('.knowledge-graph').screenshot({ path: info.outputPath('graph.png') });
  await expect(page.getByRole('status').first()).toContainText('connections');
});
