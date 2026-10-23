import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 5 exit check in a browser. Manuscript: a chapter draft with a
 * citation exported to Word. The browser has no Pandoc, so the in-memory
 * stand-in writes what it was given; the desktop check uses real Pandoc.
 * Data viewer: a CSV file edited with a formula, saved and plotted.
 */

const LIBRARY = JSON.stringify([
  {
    id: 'smith2024',
    title: 'Tau spreads in the fly brain',
    author: [{ family: 'Smith', given: 'Alice' }],
    issued: { 'date-parts': [[2024]] },
  },
]);

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: {
      references: { enabled: true },
      manuscript: { enabled: true },
      'data-viewer': { enabled: true },
    },
  }),
  'references/library.json': LIBRARY,
  'Thesis/Chapter 1.md':
    '---\ntype: manuscript\nauthor: Ray Price\n---\n1. [[Background]]\n2. [[Aims]]\n',
  'Thesis/Background.md': '# Background\n\nTau spreads between neurons [@smith2024].\n',
  'Thesis/Aims.md': 'We test whether LPS changes climbing.\n',
  'Thesis/climbing.csv': 'genotype,cm\nw1118,12\nmutant,7\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });

async function exports(page: Page): Promise<[string, string][]> {
  return page.evaluate(() =>
    Object.entries(window.__benchworkMemory?.snapshot() ?? {})
      .filter(([p]) => p.startsWith('exports/'))
      .map(([p, t]) => [p, t ?? ''] as [string, string]),
  );
}

async function runCommand(page: Page, name: string) {
  await page.keyboard.press('Control+k');
  const list = page.getByRole('dialog', { name: 'Commands' });
  await list.getByRole('textbox', { name: 'Find a command' }).fill(name);
  await list.getByRole('button', { name }).click();
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
  await tree(page).getByRole('treeitem', { name: 'Thesis' }).click();
  await tree(page).getByRole('treeitem', { name: 'Chapter 1' }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Chapter 1');
});

test('a chapter draft is exported to Word with its citations', async ({ page }) => {
  await runCommand(page, 'Manuscript overview');
  const parts = page.getByRole('table', { name: 'Parts' });
  await expect(parts).toContainText('Background');
  await expect(parts).toContainText('Total');

  await page.getByRole('button', { name: 'Export to Word' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved exports/' })).toBeVisible();

  const [[path, text] = ['', '']] = await exports(page);
  expect(path).toMatch(/^exports\/Chapter 1 .+\.docx$/);
  expect(text).toContain('bibliography: references/library.json');
  expect(text).toContain('Tau spreads between neurons [@smith2024].');
  expect(text).toContain('# Aims\n\nWe test whether LPS changes climbing.');
});

test('the Manuscript settings say whether Pandoc is installed', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(page.getByText('Pandoc 3.6 (in memory) is installed.')).toBeVisible();
  await expect(page.getByText('Chicago author-date (Pandoc’s own)')).toBeVisible();
});

test('a CSV file is edited with a formula, saved and plotted', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'climbing.csv' }).click();
  const sheet = page.getByRole('table', { name: 'Sheet' });
  await expect(sheet).toContainText('w1118');

  // The spare cell below the data, in column B.
  await sheet.getByRole('row').nth(4).locator('td').nth(1).click();
  await page.keyboard.type('=SUM(B2:B3)');
  await page.keyboard.press('Enter');
  await expect(sheet).toContainText('19');
  // Saved by itself a moment after the edit.
  await expect
    .poll(() => page.evaluate(() => window.__benchworkMemory?.snapshot()['Thesis/climbing.csv']))
    .toBe('genotype,cm\nw1118,12\nmutant,7\n,19\n');

  await page.getByRole('button', { name: 'Plot' }).click();
  const plot = page.getByRole('region', { name: 'Plot' });
  await plot.getByRole('combobox', { name: 'Chart' }).selectOption('bar');
  // Plotly is large and loaded on first use.
  await expect(plot.locator('.plot-area svg.main-svg').first()).toBeVisible({ timeout: 20_000 });
});
