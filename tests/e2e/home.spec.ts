import { expect, test } from '@playwright/test';

/** Home: what BenchWork opens on, with cards, tools and pinned pages. */

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { tasks: { enabled: true }, 'mind-maps': { enabled: true } },
  }),
  'Lab/Plan.md': `# Plan\n\n- [ ] Order fly food 📅 ${day(0)}\n`,
  'Lab/Notes.md': '# Notes\n\nSome notes.\n',
};

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

test('Home shows recent pages, tasks due and tools, and a page can be pinned to it', async ({
  page,
}) => {
  const home = page.getByRole('article', { name: 'Home' });
  await expect(home).toBeVisible();
  const recent = home.getByRole('region', { name: 'Recent pages' });
  await expect(recent.getByRole('button', { name: /Plan/ })).toBeVisible();
  await expect(home.getByRole('region', { name: 'Due today' })).toContainText('Order fly food');

  // Tools open from Home and from the sidebar.
  await home.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
  const sidebar = page.getByRole('navigation', { name: 'Vault' });
  await sidebar.getByRole('button', { name: 'Canvases' }).click();
  await expect(page.getByRole('heading', { name: 'Canvases', level: 1 })).toBeVisible();

  // A page pinned from its top bar shows on Home.
  await page
    .getByRole('tree', { name: 'Notebooks' })
    .getByRole('treeitem', { name: 'Lab' })
    .click();
  await page.getByRole('treeitem', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'Pin to Home' }).click();
  await page.locator('.top-bar').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(home.getByRole('region', { name: 'Pinned' }).getByRole('button')).toHaveText(
    /Notes/,
  );
});

test('cards can be moved and hidden, and stay that way', async ({ page }) => {
  const home = page.getByRole('article', { name: 'Home' });
  await home.getByRole('button', { name: 'Edit home' }).click();
  await home.getByRole('button', { name: 'Hide Tools' }).click();
  await home.getByRole('button', { name: 'Move Recent pages up' }).click();
  await home.getByRole('button', { name: 'Done' }).click();
  await expect(home.getByRole('heading', { level: 2 })).toHaveText([
    'Today',
    'Recent pages',
    'Pinned',
    'Calendar',
    'Due today',
    'Reminders',
  ]);

  // Still so after going to a page and back.
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Home' })
    .click();
  await expect(home.getByRole('heading', { level: 2 })).toHaveText([
    'Today',
    'Recent pages',
    'Pinned',
    'Calendar',
    'Due today',
    'Reminders',
  ]);
});

test('widgets are dragged between docks, and added from the + menu', async ({ page }) => {
  // The docks on the right show unless they were hidden.
  const show = page.getByRole('button', { name: 'Show the side panel' });
  if ((await show.count()) > 0) await show.click();
  const top = page.getByRole('region', { name: 'Right side, top' });
  const left = page.getByRole('region', { name: 'Under the notebooks' });
  await expect(top.getByRole('tab', { name: 'Due today' })).toBeVisible();

  await top.getByRole('tab', { name: 'Due today' }).dragTo(left.getByRole('tablist'));
  await expect(left.getByRole('tab', { name: 'Due today' })).toBeVisible();
  await expect(top.getByRole('tab', { name: 'Due today' })).toHaveCount(0);
  await expect(left).toContainText('Order fly food');

  await page.getByRole('button', { name: 'Add a widget right side, bottom' }).click();
  await page.getByRole('menuitem', { name: 'Calendar' }).click();
  const bottom = page.getByRole('region', { name: 'Right side, bottom' });
  await expect(bottom.getByRole('grid')).toBeVisible();
});
