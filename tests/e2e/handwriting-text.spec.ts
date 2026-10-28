import { expect, test, type Page } from '@playwright/test';

/**
 * Handwriting to text, with a stand-in for the tablet's recogniser: a
 * drawing's writing is read and saved in its file, search finds its page,
 * and the lasso converts writing to text in the page.
 */

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { handwriting: { enabled: true } },
  }),
  'Lab/Notes.md': '# Notes\n\nFirst paragraph.\n',
};

async function snapshot(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => window.__benchworkMemory?.snapshot() ?? {});
}

async function inkFile(page: Page): Promise<string> {
  return Object.entries(await snapshot(page)).find(([p]) => p.endsWith('.ink.json'))?.[1] ?? '';
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', files);
    memory.useHandwriting(() => 'Flies flipped');
    memory.queuePick('C:/Vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Lab' }).click();
  await tree.getByRole('treeitem', { name: 'Notes' }).click();
  await page.locator('.page-editor p').first().click();
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Drawing' })
    .click();
  const area = await page.locator('.ink-embed .ink-area').boundingBox();
  if (!area) throw new Error('No drawing');
  await page.mouse.move(area.x + 30, area.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(area.x + 30 + i * 12, area.y + 60 + (i % 2) * 8);
  }
  await page.mouse.up();
});

test('writing in a drawing is read, saved in its file, and found by search', async ({ page }) => {
  await expect
    .poll(() => inkFile(page), { timeout: 8000 })
    .toContain('"recognisedText": "Flies flipped"');
  await page.getByRole('searchbox', { name: 'Search pages' }).fill('flipped');
  await expect(page.getByRole('list', { name: 'Search results' })).toContainText('Notes');
});

test('the lasso converts writing to text, in the page below the drawing', async ({ page }) => {
  await page.getByRole('tab', { name: 'Draw' }).click();
  await page.getByRole('button', { name: /^Lasso/ }).click();
  const area = await page.locator('.ink-embed .ink-area').boundingBox();
  if (!area) throw new Error('No drawing');
  const loop: [number, number][] = [
    [10, 30],
    [160, 30],
    [160, 100],
    [10, 100],
    [10, 30],
  ];
  await page.mouse.move(area.x + 10, area.y + 30);
  await page.mouse.down();
  for (const [x, y] of loop) await page.mouse.move(area.x + x, area.y + y, { steps: 4 });
  await page.mouse.up();
  await page
    .getByRole('toolbar', { name: 'Chosen strokes' })
    .getByRole('button', { name: 'Convert to text' })
    .click();
  await expect(page.locator('.page-editor p', { hasText: 'Flies flipped' })).toHaveCount(1);
  await expect.poll(() => inkFile(page)).toContain('"strokes": []');
  await expect
    .poll(async () => (await snapshot(page))['Lab/Notes.md'])
    .toMatch(/!\[\[attachments\/Ink [^\]]+\]\]\n\nFlies flipped/);
});
