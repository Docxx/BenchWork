import { expect, test, type Page } from '@playwright/test';

/**
 * The tablet layout: held upright, the sidebar and side panel slide over
 * the page; on a touch screen, a button writes a quick note on today's page.
 */

test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Notes.md': '# Notes\n\nFirst paragraph.\n',
};

const nav = (page: Page) => page.getByRole('navigation', { name: 'Vault' });
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', files);
    memory.queuePick('C:/Vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
});

test('upright, the sidebar slides over the page and goes once a page is chosen', async ({
  page,
}) => {
  // With no page open, the sidebar is there to choose one.
  await expect(nav(page)).toBeVisible();
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Lab' }).tap();
  await tree.getByRole('treeitem', { name: 'Notes' }).tap();
  await expect(title(page)).toHaveValue('Notes');
  await expect(nav(page)).toBeHidden();

  // The page has the whole width.
  const editor = await page.locator('.shell-main').boundingBox();
  expect(Math.round(editor?.width ?? 0)).toBe(820);

  await page.getByRole('button', { name: 'Show the sidebar' }).tap();
  await expect(nav(page)).toBeVisible();
  // Tapping beside it puts it away.
  await page.mouse.click(700, 600);
  await expect(nav(page)).toBeHidden();

  await page.getByRole('button', { name: 'Show the side panel' }).tap();
  await expect(page.getByRole('heading', { name: 'Outline' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Outline' })).toBeHidden();
});

test('the quick note button opens today’s page, ready to write', async ({ page }) => {
  const quick = page.getByRole('button', { name: 'Quick note on today’s page' });
  await expect(quick).toBeVisible();
  await quick.tap();
  const today = new Date().toLocaleDateString('en-CA');
  await expect(title(page)).toHaveValue(new RegExp(today));
  await page.keyboard.type('Flies flipped');
  await expect(page.locator('.page-editor p').last()).toHaveText('Flies flipped');
  const daily = () =>
    page.evaluate((d) => {
      const files = window.__benchworkMemory?.snapshot() ?? {};
      return Object.entries(files).find(([p]) => p.endsWith(`${d}.md`))?.[1] ?? '';
    }, today);
  await expect.poll(daily, { timeout: 10_000 }).toContain('Flies flipped');
});
