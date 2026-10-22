import { expect, test, type Page } from '@playwright/test';

/** A 1x1 PNG, so pasted images really load. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Plan.md': 'Bench notes.\n',
  'Lab/Figures.md': 'Before ![[attachments/gone.png]] after.\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const editor = (page: Page) => page.locator('.page-editor');

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

async function attachments(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(window.__benchworkMemory?.snapshot() ?? {}).filter((p) =>
      p.startsWith('attachments/'),
    ),
  );
}

async function openPage(page: Page, name: string) {
  await tree(page).getByRole('treeitem', { name }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue(name);
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
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await openPage(page, 'Plan');
});

test('a pasted screenshot is saved in attachments and shown in the page', async ({ page }) => {
  await editor(page).locator('p').last().click();
  await page.keyboard.press('End');
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    document
      .querySelector('.page-editor')
      ?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
  }, PNG_BASE64);

  await expect(editor(page).locator('img.page-image')).toBeVisible();
  await expect.poll(() => attachments(page)).toHaveLength(1);
  const [saved] = await attachments(page);
  expect(saved).toMatch(/^attachments\/Pasted image \d{4}-\d{2}-\d{2} \d{6}\.png$/);
  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain(`![[${saved ?? ''}]]`);
});

test('a dropped file is copied in and linked from the page', async ({ page }) => {
  const box = await editor(page).locator('p').last().boundingBox();
  if (!box) throw new Error('no paragraph');
  await page.evaluate(
    ({ x, y }) => {
      const data = new DataTransfer();
      data.items.add(new File(['fly,height\n1,4.2\n'], 'climbing day7.csv', { type: 'text/csv' }));
      document.querySelector('.page-editor')?.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { x: box.x + box.width - 2, y: box.y + box.height / 2 },
  );

  await expect(editor(page).locator('.wiki-link')).toHaveText('attachments/climbing day7.csv');
  expect(await file(page, 'attachments/climbing day7.csv')).toBe('fly,height\n1,4.2\n');
  await expect.poll(() => file(page, 'Lab/Plan.md')).toContain('[[attachments/climbing day7.csv]]');
});

test('an embedded image whose file is missing shows as a crossed-out chip', async ({ page }) => {
  await openPage(page, 'Figures');
  await expect(editor(page).locator('.wiki-link.missing')).toHaveText('attachments/gone.png');
  expect(await file(page, 'Lab/Figures.md')).toBe(VAULT['Lab/Figures.md']);
});
