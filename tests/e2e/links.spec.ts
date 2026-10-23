import { expect, test, type Page } from '@playwright/test';
import { clickInto } from './helpers';

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Plan.md': '# October plan\n\nOrder fly food. #todo\n',
  'Lab/Notes.md': 'Bench notes.\n',
  'Lab/Experiments/Dose.md': 'Follow the [[Plan|lab plan]]. Also see [[Western blot]].\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const editor = (page: Page) => page.locator('.page-editor');
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

async function openPage(page: Page, ...names: string[]) {
  for (const name of names.slice(0, -1)) {
    const item = tree(page).getByRole('treeitem', { name });
    if ((await item.getAttribute('aria-expanded')) !== 'true') await item.click();
  }
  await tree(page)
    .getByRole('treeitem', { name: names.at(-1) ?? '' })
    .click();
  await expect(title(page)).toHaveValue(names.at(-1) ?? '');
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

test('[[ links to a page, saved as a wiki link', async ({ page }) => {
  await openPage(page, 'Lab', 'Notes');
  await clickInto(editor(page).locator('p').last());
  await page.keyboard.press('End');
  await page.keyboard.type(' See [[Dos');
  const menu = page.getByRole('listbox', { name: 'Link to page' });
  await expect(menu.getByRole('option').first()).toContainText('Dose');
  await page.keyboard.press('Enter');

  await expect(editor(page).locator('.wiki-link')).toHaveText('Dose');
  await expect.poll(() => file(page, 'Lab/Notes.md')).toContain('Bench notes. See [[Dose]]');
});

test('a link typed in full becomes a link', async ({ page }) => {
  await openPage(page, 'Lab', 'Notes');
  await clickInto(editor(page).locator('p').last());
  await page.keyboard.press('End');
  await page.keyboard.type(' Ask [[Plan|the plan]]');
  await page.keyboard.press('Escape');
  await expect(editor(page).locator('.wiki-link')).toHaveText('the plan');
  await expect.poll(() => file(page, 'Lab/Notes.md')).toContain('[[Plan|the plan]]');
});

test('clicking a link opens its page, and a missing page is created', async ({ page }) => {
  await openPage(page, 'Lab', 'Experiments', 'Dose');
  const missing = editor(page).locator('.unresolved .wiki-link');
  await expect(missing).toHaveText('Western blot');

  await editor(page).locator('.wiki-link', { hasText: 'lab plan' }).click();
  await expect(title(page)).toHaveValue('Plan');

  await openPage(page, 'Lab', 'Experiments', 'Dose');
  await editor(page).locator('.wiki-link', { hasText: 'Western blot' }).click();
  await expect(title(page)).toHaveValue('Western blot');
  expect(await file(page, 'Lab/Experiments/Western blot.md')).toMatch(/^---\nid: /);
});

test('backlinks show at the foot of a linked page only', async ({ page }) => {
  await openPage(page, 'Lab', 'Notes');
  await expect(page.getByRole('region', { name: 'Linked from' })).toHaveCount(0);

  await openPage(page, 'Lab', 'Plan');
  const backlinks = page.getByRole('region', { name: 'Linked from' });
  await expect(backlinks).toContainText('Linked from 1 page');
  await expect(backlinks).toContainText('Follow the lab plan.');
  await backlinks.getByRole('button', { name: /Dose/ }).click();
  await expect(title(page)).toHaveValue('Dose');
});

test('renaming a page updates links to it', async ({ page }) => {
  await openPage(page, 'Lab', 'Plan');
  await title(page).fill('October plan');
  await title(page).press('Enter');
  await expect(page.getByText('Updated links in 1 page.')).toBeVisible();
  expect(await file(page, 'Lab/Experiments/Dose.md')).toBe(
    'Follow the [[October plan|lab plan]]. Also see [[Western blot]].\n',
  );
});

test('clicking a tag lists the pages with it', async ({ page }) => {
  await openPage(page, 'Lab', 'Plan');
  await editor(page).locator('.tag', { hasText: '#todo' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search pages' })).toHaveValue('#todo');
  await expect(
    page.getByRole('list', { name: 'Search results' }).getByRole('button'),
  ).toContainText('Plan');
});
