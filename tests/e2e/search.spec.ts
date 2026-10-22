import { expect, test, type Page } from '@playwright/test';

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'LPS model/Experiments/Dose.md': '# LPS dose\n\nClimbing at day 7 after LPS feeding.\n',
  'Lab/Plan.md': 'Order fly food.\n',
  'Daily/2026-10-22.md': 'Flies transferred 10:30.\n',
  'templates/Experiment.md': 'Climbing template.\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search pages' });
const results = (page: Page) => page.getByRole('list', { name: 'Search results' });
const editor = (page: Page) => page.locator('.page-editor');

async function search(page: Page, query: string) {
  await page.keyboard.press('Control+e');
  await expect(searchBox(page)).toBeFocused();
  await searchBox(page).fill(query);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', files);
    memory.queuePick('C:/Vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(tree(page)).toBeVisible();
});

test('Ctrl+E searches pages and opens a result', async ({ page }) => {
  await search(page, 'climb');
  const result = results(page).getByRole('button');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Dose');
  await expect(result).toContainText('LPS model > Experiments');
  await expect(result.locator('mark')).toHaveText('Climbing');

  await result.click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Dose');

  await searchBox(page).press('Escape');
  await expect(searchBox(page)).toHaveValue('');
  await expect(tree(page)).toBeVisible();
});

test('says when nothing matches', async ({ page }) => {
  await search(page, 'antibody');
  await expect(page.getByText('No pages found.')).toBeVisible();
});

test('finds what was just typed in a page', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Plan' }).click();
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ordered yeast today.');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await search(page, 'yeast');
  await expect(results(page).getByRole('button')).toContainText('Plan');
});

test('follows renames and changes made outside the app', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Plan' }).click();
  const title = page.getByRole('textbox', { name: 'Page title' });
  await title.fill('October plan');
  await title.press('Enter');
  await expect(tree(page).getByRole('treeitem', { name: 'October plan' })).toBeVisible();

  await search(page, 'fly food');
  await expect(results(page).getByRole('button')).toContainText('October plan');

  await page.evaluate(() =>
    window.__benchworkMemory?.externalWrite('Daily/2026-10-22.md', 'Antibody arrived.\n'),
  );
  await searchBox(page).fill('antibody');
  await expect(results(page).getByRole('button')).toContainText('2026-10-22');
});

test('the index can be rebuilt from Settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Vault' }).click();
  await page.getByRole('button', { name: 'Rebuild search index' }).click();
  await expect(page.getByRole('button', { name: 'Rebuild search index' })).toBeEnabled();
  await search(page, 'transferred');
  await expect(results(page).getByRole('button')).toContainText('2026-10-22');
});
