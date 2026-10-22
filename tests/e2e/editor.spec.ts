import { expect, test, type Page } from '@playwright/test';

const PLAN = [
  '---',
  'id: plan-1',
  '# kept comment',
  '---',
  '# October plan',
  '',
  '* Order *fly* food',
  '* Flip vials',
  '',
  'See [[Climbing assay]] for details.',
  '',
].join('\n');

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Plan.md': PLAN,
  'Lab/Other.md': 'Another page.\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const editor = (page: Page) => page.locator('.page-editor');

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
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
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Plan' }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Plan');
});

test('opens a page without showing Markdown', async ({ page }) => {
  await expect(editor(page).getByRole('heading', { name: 'October plan' })).toBeVisible();
  await expect(editor(page).locator('li')).toHaveCount(2);
  await expect(editor(page).locator('em')).toHaveText('fly');
  await expect(editor(page).locator('.wiki-link')).toHaveText('Climbing assay');
  await expect(editor(page)).not.toContainText('*');
  await expect(editor(page)).not.toContainText('[[');
  expect(await file(page, 'Lab/Plan.md')).toBe(PLAN);
});

test('autosaves typing, leaving untouched blocks exactly as written', async ({ page }) => {
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Added from the keyboard.');
  await expect(page.getByRole('status').filter({ hasText: /Edited|Saving|Saved/ })).toBeVisible();
  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain('Added from the keyboard.');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  const saved = (await file(page, 'Lab/Plan.md')) ?? '';
  // Frontmatter keeps its comment and gains a modified time; the list keeps its * bullets.
  expect(saved).toMatch(/^---\nid: plan-1\n# kept comment\nmodified: \S+\n---\n/);
  expect(saved).toContain(
    '* Order *fly* food\n* Flip vials\n\nSee [[Climbing assay]] for details.',
  );
  expect(saved.endsWith('\n\nAdded from the keyboard.\n')).toBe(true);
});

test('the / menu turns a line into a heading or a checklist', async ({ page }) => {
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/head');
  const menu = page.getByRole('listbox', { name: 'Insert block' });
  await expect(menu.getByRole('option')).toHaveText(['Heading 1', 'Heading 2', 'Heading 3']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Results');
  await expect(editor(page).getByRole('heading', { name: 'Results' })).toBeVisible();

  await page.keyboard.press('Enter');
  await page.keyboard.type('/check');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Weigh flies');
  await editor(page).locator('ul[data-type="taskList"] input[type="checkbox"]').check();

  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain('## Results\n\n- [x] Weigh flies');
});

test('renaming the title renames the file', async ({ page }) => {
  const title = page.getByRole('textbox', { name: 'Page title' });
  await title.fill('November plan');
  await title.press('Enter');
  await expect(tree(page).getByRole('treeitem', { name: 'November plan' })).toBeVisible();
  expect(await file(page, 'Lab/November plan.md')).toBe(PLAN);
  expect(await file(page, 'Lab/Plan.md')).toBeNull();
});

test('a change made outside BenchWork appears in the open page', async ({ page }) => {
  await page.evaluate(() =>
    window.__benchworkMemory?.externalWrite(
      'Lab/Plan.md',
      '# October plan\n\nEdited in Notepad.\n',
    ),
  );
  await expect(editor(page)).toContainText('Edited in Notepad.');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('a clash with an outside change asks, and keeps both versions', async ({ page }) => {
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Mine.');
  // Change the file before autosave runs.
  await page.evaluate(() =>
    window.__benchworkMemory?.externalWrite('Lab/Plan.md', 'Theirs from another device.\n'),
  );
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('changed outside BenchWork');
  await dialog.getByRole('button', { name: 'Keep my version' }).click();

  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain('for details. Mine.');
  const snapshots = await page.evaluate(() =>
    Object.entries(window.__benchworkMemory?.snapshot() ?? {}).filter(([p]) =>
      p.startsWith('.benchwork/snapshots/plan-1/'),
    ),
  );
  expect(snapshots.map(([, text]) => text)).toEqual(['Theirs from another device.\n']);
});

test('a new page opens ready to write in', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New page' }).click();
  await page.keyboard.press('Escape'); // keep the default name
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Untitled page');
  await editor(page).click();
  await page.keyboard.type('First words');
  await expect.poll(() => file(page, 'Lab/Untitled page.md')).toContain('First words');
});
