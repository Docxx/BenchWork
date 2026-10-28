import { expect, test, type Page } from '@playwright/test';

/**
 * Pen writing: drawings in document pages and ink boxes on free layout
 * pages, saved as .ink.json files embedded in the page.
 */

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Notes.md': '# Notes\n\nFirst paragraph.\n\nSecond paragraph.\n',
  'Lab/Board.md': '---\nlayout: free\n---\n<!-- box x=40 y=40 w=400 -->\nA box.\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });

async function snapshot(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => window.__benchworkMemory?.snapshot() ?? {});
}

async function inkFiles(page: Page): Promise<string[]> {
  return Object.keys(await snapshot(page)).filter((p) => p.endsWith('.ink.json'));
}

async function openPage(page: Page, name: string) {
  const lab = tree(page).getByRole('treeitem', { name: 'Lab' });
  if ((await lab.getAttribute('aria-expanded')) !== 'true') await lab.click();
  await tree(page).getByRole('treeitem', { name }).click();
  await expect(title(page)).toHaveValue(name);
}

/** Pen events, which Playwright's mouse cannot send. */
async function penStroke(page: Page, selector: string, points: [number, number][]) {
  await page.evaluate(
    ({ selector, points }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Nothing at ${selector}`);
      const r = el.getBoundingClientRect();
      const send = (type: string, [x, y]: [number, number]) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerType: 'pen',
            pointerId: 3,
            pressure: 0.6,
            clientX: r.left + x,
            clientY: r.top + y,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        );
      const [first, ...rest] = points;
      if (!first) return;
      send('pointerdown', first);
      for (const p of rest) send('pointermove', p);
      send('pointerup', rest.at(-1) ?? first);
    },
    { selector, points },
  );
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
  await expect(tree(page)).toBeVisible();
});

test('a drawing added from the toolbar is drawn in with the mouse, and erased', async ({
  page,
}) => {
  await openPage(page, 'Notes');
  await page.locator('.page-editor p', { hasText: 'First paragraph.' }).click();
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Drawing' })
    .click();
  const area = page.locator('.ink-embed .ink-area');
  await expect(area).toBeVisible();
  // The pen tools show once a drawing is on the page.
  await expect(page.getByRole('tab', { name: 'Draw' })).toBeVisible();

  const box = await area.boundingBox();
  if (!box) throw new Error('No drawing');
  await page.mouse.move(box.x + 30, box.y + 50);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(box.x + 30 + i * 15, box.y + 50);
  await page.mouse.up();

  await expect.poll(() => inkFiles(page)).toHaveLength(1);
  const [file = ''] = await inkFiles(page);
  await expect.poll(async () => (await snapshot(page))[file]).toMatch(/"tool":"pen"/);
  await expect
    .poll(async () => (await snapshot(page))['Lab/Notes.md'])
    .toContain(`First paragraph.\n\n![[${file}]]\n\nSecond paragraph.`);

  await page.getByRole('tab', { name: 'Draw' }).click();
  await page.getByRole('toolbar', { name: 'Draw' }).getByRole('button', { name: 'Eraser' }).click();
  await page.mouse.click(box.x + 90, box.y + 50);
  await expect.poll(async () => (await snapshot(page))[file]).toContain('"strokes": []');
});

test('the pen on a document page adds a drawing below the block it touched', async ({ page }) => {
  await openPage(page, 'Notes');
  await penStroke(page, '.page-editor p:first-of-type', [[10, 5]]);
  await expect(page.locator('.ink-embed')).toHaveCount(1);
  // The pen tools appear once a pen is seen, on their own tab.
  await expect(page.getByRole('toolbar', { name: 'Draw' })).toBeVisible();

  await penStroke(page, '.ink-embed .ink-area', [
    [20, 40],
    [60, 50],
    [100, 40],
  ]);
  await expect.poll(() => inkFiles(page)).toHaveLength(1);
  await expect
    .poll(async () => (await snapshot(page))['Lab/Notes.md'])
    .toMatch(/First paragraph\.\n\n!\[\[attachments\/Ink [^\]]+\.ink\.json\]\]\n\nSecond/);
});

test('the pen on empty space on a free layout page starts an ink box there', async ({ page }) => {
  await openPage(page, 'Board');
  await penStroke(page, '.page-editor', [[300, 400]]);
  await expect(page.locator('.free-box')).toHaveCount(2);
  await penStroke(page, '.free-box .ink-area', [
    [20, 40],
    [80, 60],
  ]);
  await expect.poll(() => inkFiles(page)).toHaveLength(1);
  await expect
    .poll(async () => (await snapshot(page))['Lab/Board.md'])
    .toMatch(/<!-- box x=\d+ y=\d+ w=480 -->\n!\[\[attachments\/Ink /);
});

test('the pen can be set to write as text, leaving the page to the system', async ({ page }) => {
  await openPage(page, 'Notes');
  await penStroke(page, '.page-editor p:first-of-type', [[10, 5]]);
  await expect(page.locator('.ink-embed')).toHaveCount(1);
  const draw = page.getByRole('toolbar', { name: 'Draw' });
  await draw.getByRole('radio', { name: 'Write as text' }).click();
  await expect(draw.getByRole('radio', { name: 'Write as text' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Now the pen on text makes no drawing.
  await penStroke(page, '.page-editor p:last-of-type', [[10, 5]]);
  await expect(page.locator('.ink-embed')).toHaveCount(1);
  expect(await page.evaluate(() => window.__benchworkMemory?.stylusHandwriting)).toBe(true);
});

test('a pen coming near a page lets go of the text, so the tablet does not turn it to text', async ({
  page,
}) => {
  await openPage(page, 'Notes');
  const editor = page.locator('.page-editor');
  const hover = () =>
    page.evaluate(() => {
      const p = document.querySelector('.page-editor p');
      const r = p?.getBoundingClientRect();
      p?.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerType: 'pen',
          buttons: 0,
          clientX: (r?.left ?? 0) + 5,
          clientY: (r?.top ?? 0) + 5,
        }),
      );
    });
  await page.locator('.page-editor p').first().click();
  await expect(editor).toBeFocused();
  await hover();
  await expect(editor).not.toBeFocused();

  // Writing as text, the page keeps its focus for the tablet to write into.
  await page.getByRole('tab', { name: 'Draw' }).click();
  await page
    .getByRole('toolbar', { name: 'Draw' })
    .getByRole('radio', { name: 'Write as text' })
    .click();
  await page.locator('.page-editor p').first().click();
  await hover();
  await expect(editor).toBeFocused();
});
