import { expect, test, type Page } from '@playwright/test';

/**
 * Free layout pages: text placed anywhere in boxes, saved as Markdown with
 * a hidden marker before each box; and the switch between free layout and
 * document for each page, with the default for new pages set per vault.
 */

const MEETING = [
  '---',
  'layout: free',
  '---',
  '<!-- box x=40 y=40 w=440 -->',
  '## Meeting with Sam',
  '',
  '- Pilot ran on **Tuesday**',
  '- Climbing ==slower== after LPS',
  '',
  '<!-- box x=540 y=40 w=240 h=160 colour=yellow -->',
  'Order fly food!',
  '',
  '<!-- box x=60 y=320 w=480 -->',
  '### Analysis',
  '',
  'Mixed model.',
  '',
].join('\n');

const VAULT = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Meeting.md': MEETING,
  'Lab/Plain.md': '# Plain page\n\nSome <u>underlined</u> text.\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });
const boxes = (page: Page) => page.locator('.page-editor > .free-box');

async function file(page: Page, path: string): Promise<string> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? '', path);
}

async function openPage(page: Page, name: string) {
  const lab = tree(page).getByRole('treeitem', { name: 'Lab' });
  if ((await lab.getAttribute('aria-expanded')) !== 'true') await lab.click();
  await tree(page).getByRole('treeitem', { name }).click();
  await expect(title(page)).toHaveValue(name);
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

test('a free layout page shows its boxes where they were placed', async ({ page }) => {
  await openPage(page, 'Meeting');
  await expect(boxes(page)).toHaveCount(3);
  const sticky = boxes(page).filter({ hasText: 'Order fly food!' });
  await expect(sticky).toHaveClass(/sticky/);
  const first = await boxes(page).first().boundingBox();
  const second = await sticky.boundingBox();
  if (!first || !second) throw new Error('Boxes not drawn');
  // Side by side: the sticky note is to the right of the first box, at the same height.
  expect(second.x).toBeGreaterThan(first.x + 400);
  expect(Math.abs(second.y - first.y)).toBeLessThan(5);
  await expect(page.locator('.page-editor mark')).toHaveText('slower');
  await page.screenshot({ path: 'test-results/free-layout-page.png' });
});

test('clicking empty page makes a box there, saved with its place', async ({ page }) => {
  await openPage(page, 'Meeting');
  const editor = page.locator('.page-editor');
  const area = await editor.boundingBox();
  if (!area) throw new Error('No page');
  // Empty page, right of the first box and below the sticky note.
  await page.mouse.click(area.x + 600, area.y + 260);
  await page.keyboard.type('A new thought');
  await expect(boxes(page)).toHaveCount(4);
  await expect
    .poll(() => file(page, 'Lab/Meeting.md'))
    .toMatch(/<!-- box x=\d+ y=\d+ w=420 -->\nA new thought/);
  // Untouched boxes are saved exactly as they were.
  expect(await file(page, 'Lab/Meeting.md')).toContain(
    '<!-- box x=540 y=40 w=240 h=160 colour=yellow -->\nOrder fly food!',
  );
});

test('a page switches between free layout and document, keeping its boxes', async ({ page }) => {
  await openPage(page, 'Meeting');
  const layout = page.getByRole('radiogroup', { name: 'Page layout' });
  await layout.getByRole('radio', { name: 'Document' }).click();
  await expect(page.locator('.page-content')).toHaveClass(/layout-document/);
  await expect.poll(() => file(page, 'Lab/Meeting.md')).not.toContain('layout: free');
  // In document view the boxes flow one after another.
  const first = await boxes(page).nth(0).boundingBox();
  const second = await boxes(page).nth(1).boundingBox();
  if (!first || !second) throw new Error('Boxes not drawn');
  expect(second.y).toBeGreaterThan(first.y + first.height - 5);
  await page.screenshot({ path: 'test-results/free-layout-document.png' });

  await layout.getByRole('radio', { name: 'Free layout' }).click();
  await expect(page.locator('.page-content')).toHaveClass(/layout-free/);
  await expect.poll(() => file(page, 'Lab/Meeting.md')).toContain('layout: free');
  expect(await file(page, 'Lab/Meeting.md')).toContain(
    '<!-- box x=540 y=40 w=240 h=160 colour=yellow -->',
  );
});

test('an ordinary page turned into a free layout page starts as one box', async ({ page }) => {
  await openPage(page, 'Plain');
  await expect(page.locator('.page-editor u')).toHaveText('underlined');
  await page
    .getByRole('radiogroup', { name: 'Page layout' })
    .getByRole('radio', { name: 'Free layout' })
    .click();
  await expect(boxes(page)).toHaveCount(1);
  await expect(boxes(page).first()).toContainText('Some underlined text.');
  // A box appears once something is written, so make an edit.
  await boxes(page).first().locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' More.');
  await expect
    .poll(() => file(page, 'Lab/Plain.md'))
    .toMatch(
      /layout: free[\s\S]*<!-- box x=40 y=40 w=640 -->\n# Plain page\n\nSome <u>underlined<\/u> text\. More\./,
    );
});

test('new pages start with the layout set for the vault', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Vault' }).click();
  await page
    .getByRole('group', { name: 'New pages start as' })
    .getByRole('radio', { name: /Free layout/ })
    .check();
  await expect.poll(() => file(page, '.benchwork/config.json')).toContain('"layout": "free"');
  await page.getByRole('button', { name: 'Settings' }).click();

  await tree(page).getByRole('treeitem', { name: 'Lab' }).hover();
  await tree(page).getByRole('button', { name: 'More for Lab' }).click();
  await page.getByRole('menuitem', { name: 'New page', exact: true }).click();
  await expect(page.locator('.page-content')).toHaveClass(/layout-free/);
  await expect(boxes(page)).toHaveCount(1);
  await expect
    .poll(() => file(page, 'Lab/Untitled page.md'))
    .toMatch(/^---\nid: .+\ncreated: .+\nlayout: free\n---\n/);
});

test('an image dropped on empty page is added to the vault, in a box where it landed', async ({
  page,
}) => {
  await openPage(page, 'Meeting');
  const area = await page.locator('.page-editor').boundingBox();
  if (!area) throw new Error('No page');
  await page.evaluate(
    async ([x = 0, y = 0]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 20;
      canvas.height = 20;
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) throw new Error('No image');
      const data = new DataTransfer();
      data.items.add(new File([blob], 'gel.png', { type: 'image/png' }));
      document.querySelector('.page-editor')?.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    },
    [area.x + 600, area.y + 260],
  );
  await expect(boxes(page)).toHaveCount(4);
  await expect
    .poll(() => file(page, 'Lab/Meeting.md'))
    .toMatch(/<!-- box x=\d+ y=\d+ w=420 -->\n!\[\[attachments\/gel\.png\]\]/);
  expect(await file(page, 'attachments/gel.png')).not.toBe('');
});
