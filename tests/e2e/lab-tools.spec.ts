import { expect, test } from '@playwright/test';

/** The Lab tools module: calculators beside a page, and bench timers. */

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { 'lab-tools': { enabled: true } },
  }),
  'Lab/Plan.md': '# Plan\n\nPBS:\n',
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

test('a buffer recipe is scaled and added to the page beside it', async ({ page }) => {
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Lab' }).click();
  await tree.getByRole('treeitem', { name: 'Plan' }).click();
  await page.getByRole('tab', { name: 'Lab tools' }).click();
  await page.getByRole('combobox', { name: 'Tool' }).selectOption('recipes');
  await page.getByLabel('Volume to make', { exact: true }).fill('500');
  await page.getByRole('combobox', { name: 'Volume to make unit' }).selectOption('mL');
  const answer = page.getByRole('status', { name: 'Ingredients' });
  await expect(answer).toContainText('NaCl');
  await expect(answer).toContainText('4 g');
  await answer.getByRole('button', { name: 'Add to page' }).click();
  await expect(page.locator('.page-editor')).toContainText('PBS 1x, 500 mL');
});

test('a timer runs while other things are open, and shows on Home', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Lab tools' })
    .click();
  await page.getByRole('button', { name: 'Timers and stopwatch' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Gel');
  await page.getByRole('button', { name: '5 min', exact: true }).click();
  const timer = page.getByRole('listitem', { name: 'Gel' });
  await expect(timer.getByRole('timer')).toHaveText(/^[45]:\d\d$/);

  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Home' })
    .click();
  const card = page.getByRole('region', { name: 'Timers' });
  await expect(card.getByRole('listitem', { name: 'Gel' })).toBeVisible();
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByRole('button', { name: 'Start' })).toBeVisible();
});
