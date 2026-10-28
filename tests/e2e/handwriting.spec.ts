import { expect, test, type Page } from '@playwright/test';

/**
 * The Handwriting module: a lasso to choose strokes and delete, recolour
 * or move them, and shapes from strokes held still at the end.
 */

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { handwriting: { enabled: true } },
  }),
  'Lab/Notes.md': '# Notes\n\nFirst paragraph.\n',
};

async function inkFile(page: Page): Promise<string> {
  return page.evaluate(() => {
    const files = window.__benchworkMemory?.snapshot() ?? {};
    return Object.entries(files).find(([p]) => p.endsWith('.ink.json'))?.[1] ?? '';
  });
}

const strokeCount = async (page: Page) => (await inkFile(page)).match(/"id":/g)?.length ?? 0;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', files);
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
  await expect(page.locator('.ink-embed .ink-area')).toBeVisible();
});

async function area(page: Page) {
  const box = await page.locator('.ink-embed .ink-area').boundingBox();
  if (!box) throw new Error('No drawing');
  return box;
}

test('the lasso chooses strokes, and deletes them', async ({ page }) => {
  const a = await area(page);
  // Two short strokes, one on the left and one on the right.
  for (const x of [40, 300]) {
    await page.mouse.move(a.x + x, a.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 5; i += 1) await page.mouse.move(a.x + x + i * 10, a.y + 60);
    await page.mouse.up();
  }
  await expect.poll(() => strokeCount(page)).toBe(2);

  await page.getByRole('tab', { name: 'Draw' }).click();
  await page.getByRole('button', { name: /^Lasso/ }).click();
  // A loop round the left stroke.
  const loop: [number, number][] = [
    [20, 30],
    [140, 30],
    [140, 100],
    [20, 100],
    [20, 30],
  ];
  await page.mouse.move(a.x + 20, a.y + 30);
  await page.mouse.down();
  for (const [x, y] of loop) await page.mouse.move(a.x + x, a.y + y, { steps: 4 });
  await page.mouse.up();

  const chosen = page.getByRole('toolbar', { name: 'Chosen strokes' });
  await expect(chosen).toBeVisible();
  await chosen.getByRole('button', { name: 'Red' }).click();
  await expect.poll(() => inkFile(page)).toContain('"colour":"#c0392b"');
  await chosen.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => strokeCount(page)).toBe(1);
  await expect(chosen).toHaveCount(0);
});

test('a stroke held still at the end becomes a straight line', async ({ page }) => {
  const a = await area(page);
  await page.mouse.move(a.x + 30, a.y + 40);
  await page.mouse.down();
  for (let i = 1; i <= 20; i += 1) {
    await page.mouse.move(a.x + 30 + i * 12, a.y + 40 + (i % 3) * 2 + i);
  }
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect.poll(() => strokeCount(page)).toBe(1);
  // Every point now lies on the line from its start to its end.
  const points = JSON.parse(
    /"points":(\[\[.*?\]\])/.exec(await inkFile(page))?.[1] ?? '[]',
  ) as number[][];
  const [x0 = 0, y0 = 0] = points[0] ?? [];
  const [x1 = 0, y1 = 0] = points.at(-1) ?? [];
  for (const [x = 0, y = 0] of points) {
    expect(
      Math.abs((y - y0) * (x1 - x0) - (x - x0) * (y1 - y0)) / Math.hypot(x1 - x0, y1 - y0),
    ).toBeLessThan(1);
  }
});

test('scribbling over a stroke erases it, and the scribble', async ({ page }) => {
  const a = await area(page);
  await page.mouse.move(a.x + 40, a.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(a.x + 40 + i * 10, a.y + 60 + (i % 2) * 6);
  await page.mouse.up();
  await expect.poll(() => strokeCount(page)).toBe(1);

  await page.mouse.move(a.x + 30, a.y + 55);
  await page.mouse.down();
  for (let leg = 0; leg < 6; leg += 1) {
    const x = leg % 2 === 0 ? 130 : 30;
    await page.mouse.move(a.x + x, a.y + 55 + leg * 2, { steps: 5 });
  }
  await page.mouse.up();
  await expect.poll(() => inkFile(page)).toContain('"strokes": []');
});
