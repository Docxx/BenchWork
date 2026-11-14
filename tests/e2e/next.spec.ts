import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateArchive, WORKSPACE_FILE } from '../../src/next/storage';
import { parseWorkspace, seedWorkspace } from '../../src/next/model';

async function nav(page: Page, name: string) {
  await page
    .locator('.nx-nav-item')
    .filter({ hasText: new RegExp(`^${name}`) })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/next.html');
  await expect(page.locator('.nx-app')).toBeVisible();
});

test('project steps, theme and module choices survive a restart', async ({ page }) => {
  await nav(page, 'Projects');
  await page.getByRole('button', { name: 'New step', exact: true }).click();
  await page.getByLabel('The next step').fill('Repeat the recovery acquisition');
  await page.getByRole('button', { name: 'Add this step' }).click();
  await page.getByLabel('Move Repeat the recovery acquisition').selectOption('In progress');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.getByText('Saved on this device', { exact: true }).waitFor();
  await page.reload();
  await expect(page.locator('.nx-app')).toHaveClass(/nx-dark/);
  await nav(page, 'Projects');
  await expect(
    page
      .getByRole('region', { name: 'In progress', exact: true })
      .getByRole('button', { name: 'Repeat the recovery acquisition' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Make it yours/ }).click();
  await page.getByRole('switch', { name: 'Focus room module' }).click();
  await expect(page.locator('.nx-nav-item').filter({ hasText: 'Focus room' })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Focus room module' }).click();
  await expect(page.locator('.nx-nav-item').filter({ hasText: 'Focus room' })).toHaveCount(1);
});

test('the real notebook saves edits and exports a complete portable workspace', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Quick capture', exact: true }).click();
  await page.getByLabel('Give the thought a name').fill('A stronger control');
  await page
    .getByLabel('A little more, if you like')
    .fill('Record the negative control before the next run.');
  await page.getByRole('button', { name: 'Save this thought' }).click();
  await expect(page.locator('.page-editor')).toContainText('Record the negative control');
  await page.locator('.page-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Keep the acquisition settings with the image.');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await page.getByText('Saved on this device', { exact: true }).waitFor();
  await page.reload();
  await nav(page, 'Notebook');
  await page.locator('.nx-note-list-item').filter({ hasText: 'A stronger control' }).click();
  await expect(page.locator('.page-editor')).toContainText(
    'Keep the acquisition settings with the image.',
  );
  await page.getByRole('button', { name: /Ray’s research studio Personal workspace/ }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export workspace A portable copy/ }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('Workspace export was not downloaded');
  const archive = validateArchive(JSON.parse(await readFile(path, 'utf8')) as unknown);
  const metadata = archive.entries.find((e) => e.path === WORKSPACE_FILE)?.data;
  if (!metadata) throw new Error('Missing workspace metadata');
  expect(
    parseWorkspace(Buffer.from(metadata, 'base64').toString('utf8')).notes.some(
      (n) => n.title === 'A stronger control',
    ),
  ).toBe(true);
  const text = archive.entries
    .filter((e) => e.path.endsWith('.md'))
    .map((e) => Buffer.from(e.data ?? '', 'base64').toString('utf8'))
    .join('\n');
  expect(text).toContain('Keep the acquisition settings with the image.');
  expect(archive.entries.some((e) => e.path.endsWith('.figure.json'))).toBe(true);
});

test('evidence, a protocol report and the focus timer connect to the wider workspace', async ({
  page,
}) => {
  await nav(page, 'Evidence');
  await page.getByRole('button', { name: 'Add a source', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('A source worth questioning');
  await page.getByLabel('Author, citation or source').fill('Own experiment');
  await page.getByLabel('Why it matters').fill('Test the alternative explanation.');
  await page.getByLabel('New source tags').fill('recovery, imaging');
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByLabel('Source tags', { exact: true })).toHaveValue('recovery, imaging');
  await expect(page.getByRole('complementary', { name: 'Evidence details' })).toContainText(
    'A source worth questioning',
  );
  await nav(page, 'Constellation');
  await expect(
    page.getByRole('button', { name: 'Source: A source worth questioning', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Source: A source worth questioning', exact: true })
    .click();
  await expect(page.locator('.nx-graph-inspector')).toContainText(
    'Test the alternative explanation.',
  );
  await nav(page, 'Protocol lab');
  await page
    .getByLabel('Protocol run notes')
    .fill('Control field checked. No saturation observed.');
  await page.getByRole('button', { name: 'Record step & continue' }).click();
  await expect(page.getByText('1 / 5 steps recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save a run report' }).click();
  await expect(page.locator('.page-editor')).toContainText(
    'Control field checked. No saturation observed.',
  );
  await nav(page, 'Focus room');
  await page.getByRole('button', { name: 'Begin this moment' }).click();
  await nav(page, 'Overview');
  await expect(page.getByRole('button', { name: /In your element/ })).toBeVisible();
  await page.getByRole('button', { name: /In your element/ }).click();
  await expect(page.getByRole('button', { name: 'Take a pause' })).toBeVisible();
});

test('the full figure editor exports valid SVG and original engine modules open', async ({
  page,
}) => {
  await nav(page, 'Figure studio');
  await expect(page.getByLabel('Export as')).toBeVisible();
  await page.getByLabel('Export as').selectOption('svg');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Recovery trajectory.svg' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Make it yours/ }).click();
  await page.getByRole('button', { name: /An endless whiteboard/ }).click();
  await expect(page.getByRole('heading', { name: 'Whiteboards', exact: true })).toBeVisible();
});

test('the studio fits a phone, supports keyboard search and keeps the desktop app separate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'A little more possibility.', exact: true }),
  ).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await nav(page, 'Notebook');
  await expect(page.locator('.page-editor')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search workspace').fill('recovery');
  await expect(
    page
      .getByRole('dialog', { name: 'A thought away.' })
      .getByRole('button', { name: /The recovery window Project/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a failed device save retains edits and a retry makes them durable', async ({ page }) => {
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put');
    if (!original) throw new Error('Storage method unavailable');
    Object.assign(window, {
      restoreStudioStorage: () => {
        Object.defineProperty(IDBObjectStore.prototype, 'put', original);
      },
    });
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('Test device storage full', 'QuotaExceededError');
    };
  });
  await nav(page, 'Projects');
  await page.getByLabel('Move Compare the early recovery time points').selectOption('Complete');
  await expect(page.getByRole('alert')).toContainText('Test device storage full');
  await expect(
    page
      .getByRole('region', { name: 'Complete', exact: true })
      .getByRole('button', { name: 'Compare the early recovery time points' }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { restoreStudioStorage(): void }).restoreStudioStorage();
  });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await nav(page, 'Projects');
  await expect(
    page
      .getByRole('region', { name: 'Complete', exact: true })
      .getByRole('button', { name: 'Compare the early recovery time points' }),
  ).toBeVisible();
});

test('import is validated and reviewed before replacing the isolated studio', async ({ page }) => {
  const workspace = seedWorkspace();
  if (workspace.projects[0]) workspace.projects[0].name = 'Imported project';
  const archive = {
    format: 'benchwork-next',
    version: 1,
    entries: [
      {
        path: '.benchwork/config.json',
        data: Buffer.from(
          JSON.stringify({ version: 1, modules: { figures: { enabled: true } } }),
        ).toString('base64'),
      },
      { path: WORKSPACE_FILE, data: Buffer.from(JSON.stringify(workspace)).toString('base64') },
      ...workspace.notes.map((n) => ({
        path: n.path,
        data: Buffer.from(`# ${n.title}\n\nImported page.`).toString('base64'),
      })),
    ],
  };
  await page.getByRole('button', { name: /Ray’s research studio Personal workspace/ }).click();
  await page.getByLabel('Import workspace file').setInputFiles({
    name: 'studio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await expect(page.getByText('EXPORT VALIDATED', { exact: true })).toBeVisible();
  await expect(page.locator('.nx-sidebar-projects')).not.toContainText('Imported project');
  await page.getByRole('button', { name: 'Import this workspace', exact: true }).click();
  await expect(page.locator('.nx-sidebar-projects')).toContainText('Imported project');
  await nav(page, 'Notebook');
  await expect(page.locator('.page-editor')).toContainText('Imported page.');
  await nav(page, 'Figure studio');
  await expect(page.getByRole('heading', { name: 'Figures', exact: true })).toBeVisible();
});

test('command search finds notebook body text and supports keyboard selection', async ({
  page,
}) => {
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search workspace').fill('saturation');
  await expect(
    page
      .locator('.nx-command-results')
      .getByRole('button', { name: /Live imaging \/ pilot 03 Note/ }),
  ).toBeVisible();
  await page.getByLabel('Search workspace').press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.page-editor')).toContainText('Check saturation');
});

test('a workflow can be customised, retained and recorded in the real notebook', async ({
  page,
}) => {
  await nav(page, 'Protocol lab');
  await page.getByRole('button', { name: 'Edit workflow', exact: true }).click();
  await page.getByLabel('Workflow name').fill('My imaging quality checks');
  await page.getByLabel('Step 1 title', { exact: true }).fill('Record the calibration reference');
  await page
    .getByLabel('Step 1 instructions', { exact: true })
    .fill('Keep the reference image with the acquisition metadata.');
  await page.getByLabel('Step 1 minutes', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'My imaging quality checks', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.nx-protocol-timer')).toContainText('02:00');
  await page.getByText('Saved on this device', { exact: true }).waitFor();
  await page.reload();
  await nav(page, 'Protocol lab');
  await expect(
    page.getByRole('heading', { name: 'Record the calibration reference', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Record step & continue' }).click();
  await page.getByRole('button', { name: 'Save a run report' }).click();
  await expect(page.locator('.page-editor')).toContainText('My imaging quality checks');
  await expect(page.locator('.page-editor')).toContainText(
    'Keep the reference image with the acquisition metadata.',
  );
});
