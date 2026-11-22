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
  await page.getByRole('combobox', { name: 'Add tags', exact: true }).fill('project/flies');
  await page.getByRole('combobox', { name: 'Add tags', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag project/flies' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Measurements.csv', exact: true }).click();
  await page.getByRole('combobox', { name: 'Add tags', exact: true }).fill('project/flies');
  await page.getByRole('combobox', { name: 'Add tags', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove tag project/flies' })).toBeVisible();
  await page.getByRole('button', { name: '#project/flies', exact: true }).click();
  await expect(page.locator('.search-results')).toContainText('Measurements.csv');
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Knowledge graph', exact: true })
    .click();
  await expect(page.getByRole('img', { name: /^Interactive knowledge graph/ })).toBeVisible();
  // The options bar is hidden until asked for.
  await expect(page.getByLabel('Filter graph by tag')).toHaveCount(0);
  await page.getByRole('button', { name: 'Graph options', exact: true }).click();
  await page.getByLabel('Filter graph by tag').selectOption('project/flies');
  await expect(page.locator('.graph-corner')).toHaveText('3 nodes · 3 connections');
  await page.getByRole('button', { name: 'Graph appearance', exact: true }).click();
  await page.getByLabel('Atmosphere').selectOption('violet');
  await expect(page.getByRole('checkbox', { name: 'Signals along links' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Signals along links' }).check();
  // Options are kept as they change, and are there when the graph is opened again.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__benchworkMemory?.snapshot()[
            '.benchwork/modules/knowledge-graph/appearance.json'
          ] ?? '',
      ),
    )
    .toMatch(/"palette": "violet"[\s\S]*"signals": true[\s\S]*"tag": "project\/flies"/);
  // Hidden again, it says the graph is filtered.
  await page.getByRole('button', { name: 'Graph options', exact: true }).click();
  await expect(page.getByLabel('Filter graph by tag')).toHaveCount(0);
  await expect(page.locator('.graph-filtered')).toHaveText('Filtered');
  await page.getByRole('button', { name: 'Graph options', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Knowledge graph', exact: true })
    .click();
  await expect(page.getByLabel('Filter graph by tag')).toHaveValue('project/flies');
  await expect(page.getByLabel('Atmosphere')).toHaveValue('violet');
  await expect(page.locator('.graph-corner')).toHaveText('3 nodes · 3 connections');
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

test('keeps still while a page is saved elsewhere', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Knowledge graph', exact: true })
    .click();
  const graph = page.getByRole('img', { name: /^Interactive knowledge graph/ });
  await expect(page.locator('.graph-corner')).toContainText('nodes');
  // Away from the graph, once it has grown in and settled.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3500);
  const before = await graph.screenshot();
  await page.waitForTimeout(1000);
  expect((await graph.screenshot()).equals(before), 'still before the save').toBe(true);
  // A page saved with new words but no new links or tags.
  await page.evaluate(() =>
    window.__benchworkMemory?.writeTextAtomic(
      'Research/Study 1.md',
      '---\ntags: [flies]\n---\n# Study 1\n\n[[Study 2]] [[Study 10]]\n\nMore notes.',
    ),
  );
  await page.waitForTimeout(1500);
  expect((await graph.screenshot()).equals(before)).toBe(true);
});

test('a docked graph keeps still while moving between pages and scrolling', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Knowledge graph', exact: true })
    .click();
  await page.getByRole('button', { name: 'Dock tool', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Right side, top', exact: true }).click();
  const dock = page.getByRole('region', { name: 'Right side, top' });
  const graph = dock.getByRole('img', { name: /^Interactive knowledge graph/ });
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Research', exact: true }).click();
  await tree.getByRole('treeitem', { name: 'Study 1', exact: true }).click();
  await expect(graph).toBeVisible();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(3000);
  const first = await graph.screenshot();
  // Another page and back: the graph for Study 1 comes back as it was, without growing in.
  await tree.getByRole('treeitem', { name: 'Study 2', exact: true }).click();
  await page.waitForTimeout(1500);
  await tree.getByRole('treeitem', { name: 'Study 1', exact: true }).click();
  await page.mouse.move(5, 5);
  // Long enough for the page's own highlight to ease in, far too short to grow in and settle.
  await page.waitForTimeout(1000);
  expect((await graph.screenshot()).equals(first), 'same after coming back').toBe(true);
  // Scrolling the page and moving the pointer over it leaves the graph alone.
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, 400);
  await page.mouse.move(600, 300, { steps: 10 });
  await page.waitForTimeout(800);
  expect((await graph.screenshot()).equals(first), 'same after scrolling').toBe(true);
});
