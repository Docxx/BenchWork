import { expect, test, type Page } from '@playwright/test';

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'LPS model/Experiments/Dose.md': '---\nid: a\n---\nDose notes',
  'LPS model/Plan.md': 'p',
  'LPS model/notes.txt': 'a,b',
  Archive: null,
  attachments: null,
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const row = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });

async function snapshot(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => window.__benchworkMemory?.snapshot() ?? {});
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

test('shows notebooks, sections and pages, hiding files it cannot preview', async ({ page }) => {
  await expect(tree(page).getByRole('treeitem')).toHaveCount(2);
  await row(page, 'LPS model').click();
  await expect(row(page, 'Experiments')).toBeVisible();
  await expect(row(page, 'Plan')).toBeVisible();
  await expect(tree(page).getByText('notes.txt')).toHaveCount(0);
  await expect(tree(page).getByText('attachments')).toHaveCount(0);
});

test('creates and names a notebook, then a page in it', async ({ page }) => {
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Immunofly project');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Immunofly project')).toBeVisible();

  await row(page, 'Immunofly project').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New page', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Day 1 crosses');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Day 1 crosses')).toBeVisible();

  const files = await snapshot(page);
  expect(files['Immunofly project/Day 1 crosses.md']).toMatch(/^---\nid: [0-9a-f-]{36}\n/);
});

test('renames a page, keeping it a .md file', async ({ page }) => {
  await row(page, 'LPS model').click();
  await row(page, 'Plan').click();
  await page.keyboard.press('F2');
  await page.getByRole('textbox', { name: 'Name' }).fill('Plan: October');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Plan- October')).toBeVisible();
  expect(await snapshot(page)).toHaveProperty(['LPS model/Plan- October.md'], 'p');
});

test('drags a page into another notebook, and reorders within a notebook', async ({ page }) => {
  await row(page, 'LPS model').click();
  await row(page, 'Plan').dragTo(row(page, 'Archive'));
  await expect(row(page, 'Plan')).toBeVisible();
  expect(await snapshot(page)).toHaveProperty(['Archive/Plan.md'], 'p');

  // Drop above Experiments: Plan moves back, first in LPS model's order.
  await row(page, 'Plan').dragTo(row(page, 'Experiments'), { targetPosition: { x: 20, y: 2 } });
  await expect
    .poll(async () => (await snapshot(page))['LPS model/_section.yaml'])
    .toBe('order:\n  - Plan.md\n  - Experiments\n');
  const names = await tree(page)
    .getByRole('treeitem')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(names).toEqual(['Archive', 'LPS model', 'Plan', 'Experiments']);
});

test('colours a notebook and moves a section to the Recycle Bin', async ({ page }) => {
  await row(page, 'LPS model').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Colour blue' }).click();
  await expect(row(page, 'LPS model').locator('.colour-mark')).toBeVisible();

  await row(page, 'LPS model').click();
  await row(page, 'Experiments').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Recycle Bin' }).click();
  await page.getByRole('button', { name: 'Move to Recycle Bin' }).click();
  await expect(row(page, 'Experiments')).toHaveCount(0);
  expect(await page.evaluate(() => window.__benchworkMemory?.trashed())).toEqual([
    'LPS model/Experiments',
  ]);
});

test('shows a page added outside BenchWork without refreshing', async ({ page }) => {
  await row(page, 'LPS model').click();
  await page.evaluate(() => window.__benchworkMemory?.externalWrite('LPS model/New.md', ''));
  await expect(row(page, 'New')).toBeVisible();
});

test('notebooks get icons and a sort, and favourites sit at the top', async ({ page }) => {
  // An icon, from the notebook's menu.
  await row(page, 'LPS model').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Icon…' }).click();
  await page
    .getByRole('dialog', { name: 'Icon for LPS model' })
    .getByRole('button', { name: 'Icon 🧪' })
    .click();
  await expect(row(page, 'LPS model')).toContainText('🧪');
  await expect
    .poll(async () => (await snapshot(page))['LPS model/_section.yaml'])
    .toContain('icon: 🧪');

  // Sorted Z to A: folders first, then pages.
  await row(page, 'LPS model').click();
  await expect(row(page, 'Experiments')).toBeVisible();
  await row(page, 'LPS model').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Sort: name, Z to A' }).click();
  await expect
    .poll(async () => (await snapshot(page))['LPS model/_section.yaml'])
    .toContain('sort: name-desc');
  await expect(tree(page).getByRole('treeitem')).toHaveText([
    /Archive/,
    /LPS model/,
    /Experiments/,
    /Plan/,
  ]);

  // A favourite, opened from the list at the top.
  await row(page, 'Plan').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Favourites' }).click();
  const favourites = page.getByRole('region', { name: 'Favourites' });
  await expect(favourites.getByRole('button', { name: 'Plan', exact: true })).toBeVisible();
  await favourites.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Plan');

  // Compact rows, from the list options.
  await page.getByRole('button', { name: 'List options' }).click();
  await page.getByRole('menuitem', { name: 'Compact rows' }).click();
  await expect(tree(page)).toHaveClass(/density-compact/);
});
