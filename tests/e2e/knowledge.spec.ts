import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Use the memory platform');
    const files: Record<string, string> = {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { 'knowledge-graph': { enabled: true }, 'lab-tools': { enabled: true } },
      }),
      'Lab/Plan.md': '# Plan\n\n[[Measurements.csv]]\n',
      'Lab/Measurements.csv': 'sample,value\nA,42\n',
    };
    for (let i = 0; i < 45; i++)
      files[`Research/Study ${String(i)}.md`] =
        `---\ntags: [${i % 3 === 0 ? 'protein' : i % 3 === 1 ? 'flies' : 'imaging'}]\n---\n# Study ${String(i)}\n\n[[Study ${String((i + 1) % 45)}]] [[Study ${String((i + 9) % 45)}]]`;
    memory.addFolder('C:/Vault', files);
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
});

test('tags notes and documents, finds tagged documents, and opens them through the graph', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('treeitem', { name: 'Lab', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Plan', exact: true }).click();
  await page.getByRole('textbox', { name: 'Add tags', exact: true }).fill('project/flies');
  await page.getByRole('textbox', { name: 'Add tags', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag project/flies' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Measurements.csv', exact: true }).click();
  await page.getByRole('textbox', { name: 'Add tags', exact: true }).fill('project/flies');
  await page.getByRole('textbox', { name: 'Add tags', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag project/flies' })).toBeVisible();
  await page.getByRole('button', { name: '#project/flies', exact: true }).click();
  await expect(page.locator('.search-results')).toContainText('Measurements.csv');
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Knowledge graph', exact: true })
    .click();
  await expect(page.getByRole('img', { name: /^Interactive knowledge graph/ })).toBeVisible();
  await page.getByLabel('Filter graph by tag').selectOption('project/flies');
  await expect(page.locator('.graph-corner')).toHaveText('3 nodes · 3 connections');
  await page.getByRole('button', { name: 'Graph appearance', exact: true }).click();
  await page.getByLabel('Atmosphere').selectOption('violet');
  await page.getByRole('button', { name: 'Save style', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Style saved', exact: true })).toBeVisible();
  await page.getByText('Browse files (2)', { exact: true }).click();
  await page.getByRole('button', { name: 'Open Measurements.csv', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('42');
  expect(errors).toEqual([]);
});

test('fills wide screens, docks calculators and fits a narrow device', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const home = page.getByRole('article', { name: 'Home' });
  const area = await home.boundingBox();
  expect(area?.width).toBeGreaterThan(1200);
  const controls = await home.locator('.home-controls').boundingBox();
  const hero = await home.locator('.home-header').boundingBox();
  expect((controls?.y ?? 0) + (controls?.height ?? 0)).toBeLessThanOrEqual(hero?.y ?? 0);
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Lab tools', exact: true })
    .click();
  const calculator = await page.locator('.lab-tool').boundingBox();
  expect(calculator?.width).toBeGreaterThan(600);
  await page.getByRole('button', { name: 'Dock tool', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Right side, top', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Right side, top' })
      .getByRole('combobox', { name: 'Tool', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Knowledge graph', exact: true })
    .click();
  await expect(page.locator('.graph-corner')).toContainText('nodes');
  await page.screenshot({ path: 'test-results/knowledge-graph-wide.png', fullPage: true });
  await page.setViewportSize({ width: 760, height: 1024 });
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  const sizes = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
  await page.screenshot({ path: 'test-results/knowledge-graph-tablet.png', fullPage: true });
});
