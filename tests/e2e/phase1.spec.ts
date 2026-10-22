import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 exit check, end to end in a browser: a new vault with the sample
 * notebook, lab notes written in today's page, then found by search,
 * links, backlinks and tags, and an earlier version restored.
 */

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const editor = (page: Page) => page.locator('.page-editor');
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });
const results = (page: Page) =>
  page.getByRole('list', { name: 'Search results' }).getByRole('button');

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 22, 9, 15));
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Lab vault', {});
    memory.queuePick('C:/Lab vault');
  });
  await page.getByRole('button', { name: 'New vault' }).click();
  await expect(tree(page)).toBeVisible();
});

test('a new vault starts with the Getting started notebook', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Getting started' }).click();
  await tree(page).getByRole('treeitem', { name: 'Welcome' }).click();
  await expect(editor(page).getByRole('heading', { name: 'Welcome to BenchWork' })).toBeVisible();
  await expect(editor(page)).not.toContainText('**');
});

test('lab notes are written in today’s page and found again', async ({ page }) => {
  await page.keyboard.press('Control+Shift+D');
  await expect(title(page)).toHaveValue('2026-10-22');
  await editor(page).locator('p').last().click();
  await page.keyboard.type('Spun samples at 4000 rpm for the ');
  await page.keyboard.type('[[Example exp');
  await page.getByRole('listbox', { name: 'Link to page' }).getByRole('option').first().click();
  await page.keyboard.type('#centrifuge');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect
    .poll(() => file(page, 'Daily/2026-10/2026-10-22.md'))
    .toContain('Spun samples at 4000 rpm for the [[Example experiment]] #centrifuge');

  // Full-text search.
  await page.keyboard.press('Control+e');
  await page.getByRole('searchbox', { name: 'Search pages' }).fill('4000 rpm');
  await expect(results(page)).toContainText('2026-10-22');

  // Tags.
  await page.getByRole('searchbox', { name: 'Search pages' }).fill('#centrifuge');
  await expect(results(page)).toContainText('2026-10-22');

  // The link, and the backlink it makes.
  await page.getByRole('searchbox', { name: 'Search pages' }).press('Escape');
  await editor(page).locator('.wiki-link', { hasText: 'Example experiment' }).click();
  await expect(title(page)).toHaveValue('Example experiment');
  await expect(page.getByRole('region', { name: 'Linked from' })).toContainText('2026-10-22');
});

test('an earlier version of a page can be restored', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Getting started' }).click();
  await tree(page).getByRole('treeitem', { name: 'Welcome' }).click();
  const original = await file(page, 'Getting started/Welcome.md');
  await editor(page).locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (edited by mistake)');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(() => file(page, 'Getting started/Welcome.md')).toContain('by mistake');

  await page.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('dialog', { name: 'Page history' });
  await history.getByRole('button', { name: /^Today, 09:15$/ }).click();
  await expect(history.getByLabel('Version preview')).toContainText('Welcome to BenchWork');
  await history.getByRole('button', { name: 'Restore this version' }).click();

  await expect(page.getByText('Restored an earlier version')).toBeVisible();
  await expect.poll(() => file(page, 'Getting started/Welcome.md')).toBe(original);
  await expect(editor(page)).not.toContainText('by mistake');
});
