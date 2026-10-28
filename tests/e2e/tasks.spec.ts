import { expect, test, type Page } from '@playwright/test';

/**
 * The Tasks module: checklist items from every page, as a list or a board,
 * written back to their pages.
 */

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const VAULT = {
  '.benchwork/config.json': JSON.stringify({ version: 1, modules: { tasks: { enabled: true } } }),
  'Lab/Plan.md': [
    '# Plan',
    '',
    `- [ ] Order fly food 📅 ${day(0)}`,
    '- [ ] Write up gel #doing',
    '- [x] Flip stocks',
    '',
  ].join('\n'),
  'Thesis/Chapter 1.md': `# Chapter 1\n\n- [ ] Draft methods 📅 ${day(-2)}\n`,
};

async function file(page: Page, path: string): Promise<string> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? '', path);
}

async function openTasks(page: Page) {
  await page.keyboard.press('Control+k');
  const list = page.getByRole('dialog', { name: 'Commands' });
  await list.getByRole('textbox', { name: 'Find a command' }).fill('Open tasks');
  await list.getByRole('button', { name: 'Open tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
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
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
});

test('tasks from every page are listed by due date, ticked off and dated there', async ({
  page,
}) => {
  await openTasks(page);
  const list = page.getByRole('list', { name: 'Tasks' });
  await expect(list.locator('.task-text')).toHaveText([
    'Draft methods',
    'Order fly food',
    'Write up gel',
  ]);

  await page.getByRole('combobox', { name: 'Notebook' }).selectOption('Lab');
  await expect(list.locator('.task-text')).toHaveText(['Order fly food', 'Write up gel']);
  await page.getByRole('combobox', { name: 'Notebook' }).selectOption('');

  // Ticked, it leaves the list, as done tasks are hidden.
  await list.getByRole('checkbox', { name: 'Order fly food' }).click();
  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain(`- [x] Order fly food 📅 ${day(0)}`);
  await expect(list.locator('.task-text')).toHaveText(['Draft methods', 'Write up gel']);

  await list.getByLabel('Due date for Write up gel').fill(day(3));
  await expect
    .poll(() => file(page, 'Lab/Plan.md'))
    .toContain(`- [ ] Write up gel #doing 📅 ${day(3)}`);
});

test('the board moves tasks between To do, Doing and Done', async ({ page }) => {
  await openTasks(page);
  await page.getByRole('radio', { name: 'Board' }).click();
  const column = (name: string) => page.getByRole('region', { name });
  await expect(column('Doing').getByRole('article')).toHaveText([/Write up gel/]);
  await expect(column('Done').getByRole('article')).toHaveText([/Flip stocks/]);

  await column('To do')
    .getByRole('article', { name: 'Order fly food' })
    .getByRole('button', { name: 'Move to Doing' })
    .click();
  await expect(column('Doing').getByRole('article')).toHaveCount(2);
  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain('- [ ] Order fly food #doing 📅');

  await column('Doing').getByRole('article', { name: 'Write up gel' }).dragTo(column('Done'));
  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain('- [x] Write up gel\n');
});

test('beside pages, what is due today or overdue', async ({ page }) => {
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Lab' }).click();
  await tree.getByRole('treeitem', { name: 'Plan' }).click();
  await page.getByRole('tab', { name: 'Due today' }).click();
  const side = page.locator('.tasks-side');
  await expect(side.locator('.task-text')).toHaveText(['Draft methods', 'Order fly food']);
  await expect(side.locator('.task-due.late')).toHaveCount(1);
});
