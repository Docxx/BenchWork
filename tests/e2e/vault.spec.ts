import { expect, test, type Page } from '@playwright/test';

/** Adds a folder to the in-memory disk and makes it the next folder picked. */
async function seedPick(page: Page, root: string, contents: Record<string, string | null>) {
  await page.evaluate(
    ([r, c]) => {
      const memory = window.__benchworkMemory;
      if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
      memory.addFolder(r, c);
      memory.queuePick(r);
    },
    [root, contents] as const,
  );
}

async function snapshot(page: Page, root: string) {
  return page.evaluate((r) => window.__benchworkMemory?.snapshot(r), root);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New vault' })).toBeVisible();
});

test('creates a new vault in an empty folder', async ({ page }) => {
  await seedPick(page, 'C:/Labs/LPS model', {});
  await page.getByRole('button', { name: 'New vault' }).click();

  await expect(page.getByRole('heading', { name: 'LPS model' })).toBeVisible();
  expect(Object.keys((await snapshot(page, 'C:/Labs/LPS model')) ?? {})).toEqual([
    '.benchwork',
    '.benchwork/config.json',
  ]);
});

test('asks before using a folder with files, and leaves them unchanged', async ({ page }) => {
  const files = { 'chapter 1.docx': 'draft', 'Data/run1.csv': 'a,b' };
  await seedPick(page, 'C:/Thesis', files);
  await page.getByRole('button', { name: 'Open vault' }).click();

  const dialog = page.getByRole('dialog', { name: 'Use this folder as a vault?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('C:/Thesis')).toBeVisible();
  await page.getByRole('button', { name: 'Use folder' }).click();

  await expect(page.getByRole('heading', { name: 'Thesis' })).toBeVisible();
  const after = (await snapshot(page, 'C:/Thesis')) ?? {};
  expect(after['chapter 1.docx']).toBe('draft');
  expect(after['Data/run1.csv']).toBe('a,b');
});

test('cancelling the question leaves the folder alone', async ({ page }) => {
  await seedPick(page, 'C:/Thesis', { 'chapter 1.docx': 'draft' });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('button', { name: 'Open vault' })).toBeVisible();
  expect(await snapshot(page, 'C:/Thesis')).toEqual({ 'chapter 1.docx': 'draft' });
});

test('switch vault returns to the picker', async ({ page }) => {
  await seedPick(page, 'C:/Vault', {});
  await page.getByRole('button', { name: 'New vault' }).click();
  await page.getByRole('button', { name: 'Switch vault' }).click();
  await expect(page.getByRole('button', { name: 'Open vault' })).toBeVisible();
});
