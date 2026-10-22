import { expect, test, type Page } from '@playwright/test';

/** A 1x1 PNG; sizes here are set by the page, not the file. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const editor = (page: Page) => page.locator('.page-editor');
const image = (page: Page) => editor(page).locator('img.page-image');

/** The page's text after its frontmatter, which gains an id on the first save. */
async function body(page: Page): Promise<string> {
  const text = await page.evaluate(
    () => window.__benchworkMemory?.snapshot()['Lab/Figures.md'] ?? '',
  );
  return text.replace(/^---\n[\s\S]*?\n---\n/, '');
}

async function openPage(page: Page, text: string) {
  await page.goto('/');
  await page.evaluate((body) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1}',
      'Lab/Figures.md': body,
      attachments: null,
    });
    memory.queuePick('C:/Vault');
  }, text);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await window.__benchworkMemory?.writeBytes('attachments/plot.png', bytes);
  }, PNG_BASE64);
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Figures' }).click();
  await expect(image(page)).toBeVisible();
}

test('dragging the handle resizes an image, saved Obsidian-style', async ({ page }) => {
  await openPage(page, 'Before ![[attachments/plot.png|200]] after.\n');
  await expect(image(page)).toHaveCSS('width', '200px');
  await image(page).click();
  const handle = editor(page).locator('.resize-handle');
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  if (!box) throw new Error('no handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(image(page)).toHaveCSS('width', '300px');
  await expect.poll(() => body(page)).toBe('Before ![[attachments/plot.png|300]] after.\n');
});

test('the size buttons make an image larger, smaller or its original size', async ({ page }) => {
  await openPage(page, '![graph|200](../attachments/plot.png)\n');
  await image(page).click();
  const bar = editor(page).getByRole('group', { name: 'Image size' });
  await bar.getByRole('button', { name: 'Larger' }).click();
  await expect.poll(() => body(page)).toBe('![graph|250](../attachments/plot.png)\n');
  await bar.getByRole('button', { name: 'Smaller' }).click();
  await expect.poll(() => body(page)).toBe('![graph|200](../attachments/plot.png)\n');
  await bar.getByRole('button', { name: 'Original size' }).click();
  await expect.poll(() => body(page)).toBe('![graph](../attachments/plot.png)\n');
});

test('an image can be dragged to another paragraph', async ({ page }) => {
  await openPage(page, 'First ![[attachments/plot.png|120]] line.\n\nSecond line.\n');
  const target = editor(page).locator('p', { hasText: 'Second line.' });
  const box = await target.boundingBox();
  if (!box) throw new Error('no paragraph');
  await image(page).dragTo(target, {
    targetPosition: { x: box.width - 2, y: box.height / 2 },
  });
  await expect
    .poll(() => body(page))
    .toMatch(/^First +line\.\n\nSecond line\.!\[\[attachments\/plot\.png\|120\]\]\n$/);
});
