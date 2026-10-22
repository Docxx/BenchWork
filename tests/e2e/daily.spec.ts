import { expect, test, type Page } from '@playwright/test';

const BASE = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Plan.md': 'Order food.\n',
  'Lab/Run.md': 'Run notes.\n',
  'templates/Protocol.md': '---\ntype: protocol\n---\n# {{title}}\n\n1. Prepare {{date}}\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const editor = (page: Page) => page.locator('.page-editor');
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

async function open(page: Page, extra: Record<string, string> = {}) {
  await page.clock.setFixedTime(new Date(2026, 9, 22, 9, 15));
  await page.goto('/');
  await page.evaluate(
    (files) => {
      const memory = window.__benchworkMemory;
      if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
      memory.addFolder('C:/Vault', files);
      memory.queuePick('C:/Vault');
    },
    { ...BASE, ...extra },
  );
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(tree(page)).toBeVisible();
}

test("Today creates today's page once, in a month section", async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(title(page)).toHaveValue('2026-10-22');
  await expect(
    editor(page).getByRole('heading', { name: 'Thursday 22 October 2026' }),
  ).toBeVisible();
  await expect(tree(page).getByRole('treeitem', { name: '2026-10-22' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const first = await file(page, 'Daily/2026-10/2026-10-22.md');
  expect(first).toContain('# Thursday 22 October 2026');

  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Plan' }).click();
  await expect(title(page)).toHaveValue('Plan');
  await page.keyboard.press('Control+Shift+D');
  await expect(title(page)).toHaveValue('2026-10-22');
  expect(await file(page, 'Daily/2026-10/2026-10-22.md')).toBe(first);
});

test('previous and next day skip days without a page', async ({ page }) => {
  await open(page, {
    'Daily/2026-09/2026-09-30.md': 'End of September.\n',
    'Daily/2026-10/2026-10-22.md': 'Today.\n',
  });
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(title(page)).toHaveValue('2026-09-30');
  await expect(page.getByRole('button', { name: 'Previous day' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(title(page)).toHaveValue('2026-10-22');
});

test('new daily pages start from the Daily template', async ({ page }) => {
  await open(page, { 'templates/Daily.md': '# {{date:dddd D MMMM}}\n\n## Plan\n\n## Done\n' });
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(editor(page).getByRole('heading', { name: 'Thursday 22 October' })).toBeVisible();
  await expect(editor(page).getByRole('heading', { name: 'Done' })).toBeVisible();
});

test('a new page from a template, with its name filled in', async ({ page }) => {
  await open(page);
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New page from template…' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a template' });
  await picker.getByRole('textbox', { name: 'Page name' }).fill('Western blot');
  await picker.getByRole('button', { name: 'Protocol' }).click();

  await expect(title(page)).toHaveValue('Western blot');
  await expect(editor(page).getByRole('heading', { name: 'Western blot' })).toBeVisible();
  await expect(editor(page)).toContainText('Prepare 2026-10-22');
  expect(await file(page, 'Lab/Western blot.md')).toMatch(/^---\nid: .+\ntype: protocol\n/);
});

test('/template inserts a template into the page', async ({ page }) => {
  await open(page);
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Run' }).click();
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/templ');
  await page.keyboard.press('Enter');
  await page
    .getByRole('dialog', { name: 'Choose a template' })
    .getByRole('button', { name: 'Protocol' })
    .click();

  await expect(editor(page).getByRole('heading', { name: 'Run' })).toBeVisible();
  await expect.poll(() => file(page, 'Lab/Run.md')).toContain('# Run\n\n1. Prepare 2026-10-22');
  expect(await file(page, 'Lab/Run.md')).not.toContain('type: protocol');
});

test('a page can be saved as a template and found in Settings', async ({ page }) => {
  await open(page);
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Plan' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Save as template' }).click();
  await expect(page.getByText('Saved as a template: Plan.')).toBeVisible();
  expect(await file(page, 'templates/Plan.md')).toBe('Order food.\n');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Vault' }).click();
  const list = page.getByRole('list', { name: 'Templates' });
  await expect(list).toContainText('Plan');
  await expect(list).toContainText('Protocol');
});
