import { expect, test, type Page } from '@playwright/test';
import { clickInto } from './helpers';

/**
 * Phase 2 exit check, end to end in a browser: with the Research module on,
 * a project gets an experiment and a dataset record for its data, the
 * experiment links to the dataset, and both turn up in search. Also: data
 * files preview, and a file over the size limit is linked, not copied.
 */

/** The smallest PDF pdf.js will open: one blank page. */
const PDF = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
  'trailer<</Root 1 0 R>>',
  '%%EOF',
].join('\n');

const VAULT = {
  '.benchwork/config.json': '{"version":1,"attachments":{"linkThresholdMB":1}}',
  'Reading/Smith 2024.pdf': PDF,
  'Reading/heights.csv': 'fly,height\nw1118,4.2\nelav>tau,1.9\n',
  'Reading/Notes.md': 'Reading notes.\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const row = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });
const editor = (page: Page) => page.locator('.page-editor');
const properties = (page: Page) => page.getByRole('region', { name: 'Properties' });

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Lab vault', files);
    memory.addExternalFile('D:/Raw/day7/climbing.avi', 'video frames');
    memory.queuePick('C:/Lab vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(tree(page)).toBeVisible();
});

async function switchOnResearch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await page.getByRole('switch', { name: /Research/ }).click();
  await expect(page.getByRole('switch', { name: /Research/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Settings' }).click();
}

test('an experiment links to its data, and both appear in search', async ({ page }) => {
  await switchOnResearch(page);

  // A project: a notebook with its hub page and sections.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('LPS model');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('project');
  await expect(row(page, 'Experiments')).toBeVisible();

  // A dataset record for the day 7 video, which stays on lab storage.
  await row(page, 'Data').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New dataset' }).click();
  await page.getByRole('textbox', { name: 'Dataset name' }).fill('climbing-day7');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('heading', { name: 'climbing-day7' })).toBeVisible();
  await page.evaluate(() => {
    window.__benchworkMemory?.queueFilePick(['D:/Raw/day7/climbing.avi']);
  });
  await page.getByRole('button', { name: 'Add files…' }).click();
  const files = page.getByRole('table', { name: 'Dataset files' });
  await expect(files).toContainText('climbing.avi');
  await expect(files).toContainText('12 bytes');
  await page.getByRole('button', { name: 'Check files' }).click();
  await expect(files).toContainText('Unchanged');
  const record = (await file(page, 'LPS model/Data/climbing-day7.dataset.yaml')) ?? '';
  expect(record).toContain('path: D:/Raw/day7/climbing.avi');
  expect(record).toMatch(/sha256: [0-9a-f]{64}/);

  // An experiment in the project, linked to the dataset.
  await row(page, 'Experiments').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New experiment' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('LPS dose');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('LPS dose');
  await expect(properties(page).getByText('Experiment')).toBeVisible();
  await properties(page).getByLabel('Aim').fill('Climbing at day 7 after LPS');
  await properties(page).getByLabel('Aim').press('Enter');
  await properties(page).getByLabel('Datasets').fill('climbing-day7');
  await properties(page).getByLabel('Datasets').press('Enter');
  await expect(
    properties(page).getByRole('button', { name: 'climbing-day7', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const experiment = (await file(page, 'LPS model/Experiments/LPS dose.md')) ?? '';
  expect(experiment).toContain('type: experiment');
  expect(experiment).toContain('project: "[[project]]"');
  expect(experiment).toContain('datasets: ["[[climbing-day7]]"]');

  // The link works both ways: the chip opens the dataset, which lists the experiment.
  await properties(page).getByRole('button', { name: 'climbing-day7', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'climbing-day7' })).toBeVisible();
  const linkedFrom = page.getByRole('region', { name: 'Linked from' });
  await expect(linkedFrom.getByRole('button', { name: 'LPS dose' })).toBeVisible();

  // Both turn up in search.
  await page.getByRole('searchbox', { name: 'Search pages' }).fill('climbing');
  const results = page.getByRole('list', { name: 'Search results' });
  await expect(results.getByRole('button', { name: /^LPS dose/ })).toBeVisible();
  await expect(results.getByRole('button', { name: /^climbing-day7/ })).toBeVisible();
});

test('CSV and PDF files preview from the sidebar', async ({ page }) => {
  await row(page, 'Reading').click();
  await row(page, 'heights.csv').click();
  const table = page.getByRole('table', { name: 'heights.csv' });
  await expect(table.getByRole('columnheader')).toHaveText(['fly', 'height']);
  await expect(table.getByRole('row')).toHaveCount(3);

  await row(page, 'Smith 2024.pdf').click();
  await expect(page.getByText('1 page.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible();
  await expect
    .poll(() =>
      page.getByRole('img', { name: 'Page 1' }).evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
});

test('a file over the size limit is linked where it is, not copied', async ({ page }) => {
  await row(page, 'Reading').click();
  await row(page, 'Notes').click();
  await clickInto(editor(page).locator('p').last());
  await page.keyboard.press('End');

  // Dropped files do not say where they are, so linking asks for the file.
  await page.evaluate(() => {
    window.__benchworkMemory?.addExternalFile('D:/Raw/stack.tif', new Uint8Array(2 * 1024 * 1024));
    window.__benchworkMemory?.queueFilePick(['D:/Raw/stack.tif']);
    const data = new DataTransfer();
    data.items.add(
      new File([new Uint8Array(2 * 1024 * 1024)], 'stack.tif', { type: 'image/tiff' }),
    );
    const target = document.querySelector('.page-editor p:last-child');
    const box = target?.getBoundingClientRect();
    document.querySelector('.page-editor')?.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        clientX: (box?.right ?? 0) - 2,
        clientY: (box?.top ?? 0) + 4,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const dialog = page.getByRole('alertdialog', { name: 'stack.tif' });
  await expect(dialog).toContainText('over the 1 MB limit');
  await dialog.getByRole('button', { name: 'Find it and link' }).click();

  const card = editor(page).locator('.file-embed');
  await expect(card.locator('.file-embed-name')).toHaveText('stack.tif');
  await expect(card.locator('.file-embed-kind')).toHaveText('Linked file');
  expect(await file(page, 'attachments/stack.tif')).toBeNull();
  expect(await file(page, 'attachments/stack.tif.link.yaml')).toContain('path: D:/Raw/stack.tif');
  await expect
    .poll(() => file(page, 'Reading/Notes.md'))
    .toContain('![[attachments/stack.tif.link.yaml]]');

  // Clicking the card shows where the file is.
  await card.click();
  await expect(page.getByText('D:/Raw/stack.tif')).toBeVisible();
  await page.getByRole('button', { name: 'Check file' }).click();
  await expect(page.getByText('The file is the same as when it was linked.')).toBeVisible();
});
